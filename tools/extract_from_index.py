#!/usr/bin/env python3
"""
Step 1 of 2: pull the question bank and flashcards out of your OLD single-file
app (the 21 MB index.html) and save them as plain JSON files in source/.

Usage:   python tools/extract_from_index.py path/to/old/index.html
Output:  source/questions.json     (topics + questions, every field untouched)
         source/images.json        (question pictures: file name -> data URL)
         source/cards.json         (flashcard topics + cards)
         source/card_images.json   (flashcard pictures)
         source/topic_info.json    (the one-line topic descriptions)

Nothing is edited or "fixed": questions, options, explanations, flags and
sourcePage are copied exactly as they are in the old file.
The source/ folder is private (it is in .gitignore). Never upload it.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "source"


def grab_script(text, script_id):
    m = re.search(r'<script id="%s" type="application/json">' % script_id, text)
    if not m:
        sys.exit('Could not find <script id="%s"> in the file.' % script_id)
    start = m.end()
    end = text.index("</script>", start)
    return json.loads(text[start:end])


def grab_info(text):
    m = re.search(r"const INFO=(\{.*?\});\s*\n", text, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except Exception:
        return {}


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python tools/extract_from_index.py path/to/index.html")
    src = Path(sys.argv[1])
    if not src.exists():
        sys.exit("File not found: %s" % src)
    text = src.read_text(encoding="utf-8")
    bank = grab_script(text, "bank")
    cards = grab_script(text, "cards")
    info = grab_info(text)

    OUT.mkdir(exist_ok=True)

    def dump(name, obj):
        (OUT / name).write_text(
            json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )

    qs = bank["questions"]
    dump("questions.json", {"topics": bank["topics"], "questions": qs})
    dump("images.json", bank.get("images", {}))
    dump("cards.json", {"topics": cards["topics"], "cards": cards["cards"]})
    dump("card_images.json", cards.get("images", {}))
    dump("topic_info.json", info)

    # Friendly report, plus a few sanity checks (nothing is changed).
    ids = [q["id"] for q in qs]
    refs = set()
    for q in qs:
        refs.update(i["file"] for i in q.get("images", []))
        refs.update((q.get("optionImages") or {}).values())
    missing = sorted(refs - set(bank.get("images", {})))
    nokey = [q["id"] for q in qs if q["type"] != "lab" and not q.get("correctAnswer")]
    flagged = sum(1 for q in qs if q.get("flags"))
    print("Questions:        %d in %d topics (%d unique ids)" % (len(qs), len(bank["topics"]), len(set(ids))))
    print("Question images:  %d  (referenced but missing: %d)" % (len(bank.get("images", {})), len(missing)))
    print("Flashcards:       %d in %d topics, %d images" % (len(cards["cards"]), len(cards["topics"]), len(cards.get("images", {}))))
    print("Topic descriptions found: %d" % len(info))
    print("Questions with review flags (kept exactly as they are): %d" % flagged)
    print("Questions without an answer key (kept, shown as 'No answer key'): %d" % len(nokey))
    if missing:
        print("WARNING - images referenced but not found:", ", ".join(missing[:10]))
    if len(ids) != len(set(ids)):
        print("WARNING - duplicate question ids found.")
    print("\nSaved plain JSON into %s" % OUT)
    print("Next: python tools/build.py --init-key   (first time only), then: python tools/build.py")


if __name__ == "__main__":
    main()
