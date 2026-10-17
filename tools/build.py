#!/usr/bin/env python3
"""
Step 2 of 2: encrypt the question bank and flashcards into data/*.enc files.

First time only:   python tools/build.py --init-key
    Makes a random 256-bit key, saves it to secret.key and prints it.
    Paste that printed key into Firestore: collection "config", document "bank",
    field "key" (type string).  NEVER upload secret.key anywhere.

Every time the bank changes:   python tools/build.py

What it does
  * reads the plain JSON in source/  (made by extract_from_index.py)
  * splits questions and flashcards by topic, and pictures into small packs
  * compresses (gzip) and encrypts each file with AES-256-GCM
  * writes data/*.enc + data/data-manifest.json (file list + versions)

File format of every .enc file:  1 byte format (1) + 12 byte nonce + ciphertext+tag.
The nonce is derived from the key and the content (HMAC), so a file whose content
did not change is byte-for-byte identical after a rebuild. That keeps your Git
history small and visitors' caches valid.

Needs:  pip install cryptography
"""
import argparse
import base64
import gzip
import hashlib
import hmac
import json
import os
import re
import sys
import time
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit("Missing package. Run:  pip install cryptography")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
DATA = ROOT / "data"
KEYFILE = ROOT / "secret.key"
PACK_LIMIT = 1_300_000  # about 1.3 MB of picture data per pack (before gzip)
FORMAT = 1


def slug(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:48] or "topic"


def load_key():
    if not KEYFILE.exists():
        sys.exit("secret.key not found. Run first:  python tools/build.py --init-key")
    key = base64.b64decode(KEYFILE.read_text().strip())
    if len(key) != 32:
        sys.exit("secret.key is not a 32-byte key. Delete it and run --init-key again.")
    return key


def init_key(force):
    if KEYFILE.exists() and not force:
        k = KEYFILE.read_text().strip()
        print("secret.key already exists, so I did NOT make a new one.")
        print("(A new key would make all existing data unreadable until you rebuild and")
        print(" update Firestore. Use --init-key --force only if you really want that.)\n")
        print("Your current key (paste into Firestore config/bank, field 'key'):\n")
        print(k)
        return
    k = base64.b64encode(os.urandom(32)).decode()
    KEYFILE.write_text(k + "\n")
    try:
        os.chmod(KEYFILE, 0o600)
    except Exception:
        pass
    print("New key saved to secret.key. Paste this into Firestore")
    print("  collection: config   document: bank   field: key (string)\n")
    print(k)
    print("\nKeep secret.key safe and out of GitHub (.gitignore already excludes it).")


def encrypt(key, name, obj):
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    comp = gzip.compress(raw, 9, mtime=0)
    nonce = hmac.new(key, b"nonce|" + name.encode() + b"|" + comp, hashlib.sha256).digest()[:12]
    ct = AESGCM(key).encrypt(nonce, comp, None)
    return bytes([FORMAT]) + nonce + ct, len(raw)


def read(name):
    p = SRC / name
    if not p.exists():
        sys.exit("Missing %s. Run tools/extract_from_index.py first." % p)
    return json.loads(p.read_text(encoding="utf-8"))


def pack_images(images, ordered_names, prefix):
    """Group pictures (in the given order, so one question's pictures stay together) into packs."""
    packs, cur, size, index = [], {}, 0, {}
    seen = set()
    for n in ordered_names:
        if n in seen or n not in images:
            continue
        seen.add(n)
        v = images[n]
        if cur and size + len(v) > PACK_LIMIT:
            packs.append(cur)
            cur, size = {}, 0
        cur[n] = v
        size += len(v)
    for n in images:  # anything not referenced (kept, never lost)
        if n not in seen:
            v = images[n]
            if cur and size + len(v) > PACK_LIMIT:
                packs.append(cur)
                cur, size = {}, 0
            cur[n] = v
            size += len(v)
    if cur:
        packs.append(cur)
    out = []
    for i, p in enumerate(packs, 1):
        fname = "%s-%02d.enc" % (prefix, i)
        out.append((fname, p))
        for n in p:
            index[n] = fname
    return out, index


def main():
    ap = argparse.ArgumentParser(description="Encrypt the ENCOR question bank and flashcards.")
    ap.add_argument("--init-key", action="store_true", help="make a new random key in secret.key and print it")
    ap.add_argument("--force", action="store_true", help="with --init-key: replace an existing key")
    args = ap.parse_args()
    if args.init_key:
        init_key(args.force)
        return

    key = load_key()
    qdata = read("questions.json")
    images = read("images.json")
    cdata = read("cards.json")
    cimages = read("card_images.json")
    info_path = SRC / "topic_info.json"
    info = json.loads(info_path.read_text(encoding="utf-8")) if info_path.exists() else {}

    DATA.mkdir(exist_ok=True)
    old = {p.name for p in DATA.glob("*.enc")}
    written = {}  # name -> (bytes)

    def put(name, obj):
        blob, raw = encrypt(key, name, obj)
        (DATA / name).write_bytes(blob)
        written[name] = {"size": len(blob), "raw": raw, "hash": hashlib.sha256(blob).hexdigest()[:10]}

    # ---- questions, split by topic (every field is kept exactly as it is) ----
    qs = qdata["questions"]
    topics = list(qdata["topics"])
    for q in qs:
        if q["topic"] not in topics:
            topics.append(q["topic"])
    by = {t: [] for t in topics}
    for q in qs:
        by[q["topic"]].append(q)
    meta_topics, img_order = [], []
    used_slugs = set()
    for t in topics:
        if not by[t]:
            continue
        s = slug(t)
        while s in used_slugs:
            s += "x"
        used_slugs.add(s)
        fname = "questions-%s.enc" % s
        put(fname, {"topic": t, "questions": by[t]})
        ids, nokey, labs = [], [], []
        for q in by[t]:
            ids.append(q["id"])
            if q["type"] == "lab":
                labs.append(q["id"])
            elif not q.get("correctAnswer"):
                nokey.append(q["id"])
            for im in q.get("images", []):
                img_order.append(im["file"])
            for v in (q.get("optionImages") or {}).values():
                img_order.append(v)
        meta_topics.append({"name": t, "file": fname, "ids": ids, "labs": labs, "noKey": nokey, "info": info.get(t, "")})

    # ---- question pictures in small packs ----
    qpacks, qindex = pack_images(images, img_order, "images")
    for fname, p in qpacks:
        put(fname, p)

    # ---- flashcards, split by topic ----
    ctopics = [x["t"] for x in cdata["topics"]]
    cby = {t: [] for t in ctopics}
    for c in cdata["cards"]:
        if c["t"] not in cby:
            cby[c["t"]] = []
            ctopics.append(c["t"])
        cby[c["t"]].append(c)
    meta_cards, used = [], set()
    for t in ctopics:
        if not cby[t]:
            continue
        s = slug(t)
        while s in used:
            s += "x"
        used.add(s)
        fname = "cards-%s.enc" % s
        put(fname, {"topic": t, "cards": cby[t]})
        meta_cards.append({"t": t, "n": len(cby[t]), "file": fname, "ids": [c["id"] for c in cby[t]]})
    cpacks, cindex = pack_images(cimages, list(cimages.keys()), "card-images")
    for fname, p in cpacks:
        put(fname, p)

    # ---- meta (topic list, picture index, ...) is encrypted too ----
    meta = {
        "schema": 1,
        "questionCount": len(qs),
        "topics": meta_topics,
        "cardTopics": meta_cards,
        "images": qindex,
        "cardImages": cindex,
    }
    put("meta.enc", meta)

    # ---- remove files from older builds that are no longer used ----
    for n in old - set(written):
        (DATA / n).unlink()

    version = hashlib.sha256("".join(sorted(f"{n}:{w['hash']}" for n, w in written.items())).encode()).hexdigest()[:10]
    manifest = {
        "dataVersion": version,
        "builtAt": int(time.time()),
        "files": {n: {"v": w["hash"], "size": w["size"]} for n, w in sorted(written.items())},
    }
    (DATA / "data-manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")

    total = sum(w["size"] for w in written.values())
    print("Built %d encrypted files (%.1f MB in total) into data/" % (len(written), total / 1e6))
    print("  questions : %d in %d topic files" % (len(qs), len(meta_topics)))
    print("  pictures  : %d in %d packs;  flashcard pictures: %d in %d packs" % (len(qindex), len(qpacks), len(cindex), len(cpacks)))
    print("  flashcards: %d in %d topic files" % (len(cdata["cards"]), len(meta_cards)))
    print("  data version: %s" % version)
    print("Upload the whole data/ folder to GitHub (replace the old one).")


if __name__ == "__main__":
    main()
