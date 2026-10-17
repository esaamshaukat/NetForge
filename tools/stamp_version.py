#!/usr/bin/env python3
"""
Run this after you change any of the small app files (html, css, js, icons, manifest).
It gives the app a new version number, so phones and laptops that already have the app
see the "Update available" bar and then load the new files.

    python tools/stamp_version.py

It (1) makes a short fingerprint of all the app files, (2) writes it into
service-worker.js and js/version.js, and (3) lists the files the service worker must cache.
data/ is NOT part of this: question data has its own version (build.py).
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"data", "tools", "source", ".git", "__pycache__"}
SKIP_FILES = {"service-worker.js", "firestore.rules", "README.md", ".gitignore", "secret.key"}
NOT_IN_HASH = {"js/version.js"}   # it only holds the number itself, but it must still be cached


def shell_files():
    out = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT).as_posix()
        if rel.split("/")[0] in SKIP_DIRS or rel in SKIP_FILES or rel.endswith(".pyc"):
            continue
        out.append(rel)
    return out


files = shell_files()
h = hashlib.sha256()
for f in files:
    if f in NOT_IN_HASH:
        continue
    h.update(f.encode())
    h.update((ROOT / f).read_bytes())
build = h.hexdigest()[:8]

sw = ROOT / "service-worker.js"
s = sw.read_text(encoding="utf-8")
block = "// >>> stamped\nconst BUILD = '%s';\nconst SHELL_FILES = %s;\n// <<< stamped" % (
    build, "[\n  './',\n" + ",\n".join("  '%s'" % f for f in files) + "\n]")
s = re.sub(r"// >>> stamped.*?// <<< stamped", lambda m: block, s, flags=re.S)
sw.write_text(s, encoding="utf-8")
(ROOT / "js" / "version.js").write_text(
    "// Written by tools/stamp_version.py. Do not edit by hand.\nexport const BUILD = '%s';\n" % build, encoding="utf-8")
print("App version stamped: %s  (%d files will be cached for offline use)" % (build, len(files)))
