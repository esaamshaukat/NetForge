#!/usr/bin/env python3
"""
Recovery tool: rebuilds the private source/ folder from the encrypted data/ folder.

Use it if you lost source/ (the plain ExamIce files) but still have data/ and secret.key.
Usage:   python tools/recover_source.py [path/to/data] [path/to/secret.key]
Output:  source/questions.json, images.json, cards.json, card_images.json, topic_info.json

Nothing is changed in data/. After this, `python tools/build.py` makes the same encrypted
files again (ExamIce files come out byte-for-byte identical).
"""
import base64
import gzip
import json
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit("Please run once:  pip install cryptography")

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data"
KEYFILE = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "secret.key"
OUT = ROOT / "source"


def main():
    if not KEYFILE.exists():
        sys.exit("secret.key not found: %s" % KEYFILE)
    key = base64.b64decode(KEYFILE.read_text().strip())
    if len(key) != 32:
        sys.exit("secret.key is not a 32-byte key.")

    def load(name):
        blob = (DATA / name).read_bytes()
        if blob[0] != 1:
            sys.exit("%s: unknown file format" % name)
        try:
            comp = AESGCM(key).decrypt(blob[1:13], blob[13:], None)
        except Exception:
            sys.exit("Could not decrypt %s. This is not the key these files were built with." % name)
        return json.loads(gzip.decompress(comp).decode("utf-8"))

    meta = load("meta.enc")
    topics, questions, info = [], [], {}
    for t in meta["topics"]:
        d = load(t["file"])
        topics.append(t["name"])
        # Brave questions (if any) are rebuilt from source/brave.json, not stored here
        questions += [q for q in d["questions"] if q.get("bank") != "brave"]
        if t.get("info"):
            info[t["name"]] = t["info"]
    images = {}
    for fname in sorted(set(meta["images"].values())):
        images.update(load(fname))
    cards, ctopics = [], []
    for c in meta["cardTopics"]:
        d = load(c["file"])
        ctopics.append({"t": c["t"]})
        cards += d["cards"]
    cimages = {}
    for fname in sorted(set(meta["cardImages"].values())):
        cimages.update(load(fname))

    OUT.mkdir(exist_ok=True)
    def save(name, obj):
        (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    save("questions.json", {"topics": topics, "questions": questions})
    save("images.json", images)
    save("cards.json", {"topics": ctopics, "cards": cards})
    save("card_images.json", cimages)
    save("topic_info.json", info)
    print("Recovered source/ from data/:")
    print("  %d questions in %d topics, %d question pictures" % (len(questions), len(topics), len(images)))
    print("  %d flashcards in %d topics, %d flashcard pictures" % (len(cards), len(ctopics), len(cimages)))
    print("Saved to %s" % OUT)


if __name__ == "__main__":
    main()
