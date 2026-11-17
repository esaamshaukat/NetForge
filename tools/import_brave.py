#!/usr/bin/env python3
"""
Turns the Brave screenshot bank (ss_question_bank.json) into source/brave.json,
the plain file that tools/build.py reads and encrypts together with the ExamIce bank.

Usage:   python tools/import_brave.py path/to/ss_question_bank.json
Output:  source/brave.json        (private, in .gitignore, never upload it)

Every question must carry one of the 22 NetForge topic names in "topic".
Nothing is merged or de-duplicated with ExamIce: Brave questions get their own ids (brave-001 ...).
Run it again whenever you get a new version of the Brave file (it replaces source/brave.json).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "source" / "brave.json"
PREFIX = "NEEDS VERIFICATION. "


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python tools/import_brave.py path/to/ss_question_bank.json")
    src = Path(sys.argv[1])
    if not src.exists():
        sys.exit("File not found: %s" % src)
    data = json.loads(src.read_text(encoding="utf-8"))
    topics = {k for k in json.loads((ROOT / "tools" / "subtopics.json").read_text(encoding="utf-8")) if not k.startswith("_")}
    out, bad = [], []
    # drag-and-drop items: no options; the whole solution is the answer (shown as a self-marked "lab" question)
    for e in data.get("dragDropQuestions", []):
        n = e["sourceNumber"]
        qid = "brave-dd-%03d" % n
        if e.get("topic") not in topics:
            bad.append("%s: topic %r is not one of the NetForge topics" % (qid, e.get("topic")))
            continue
        if not (e.get("answer") or "").strip():
            bad.append("%s: no solution" % qid)
            continue
        note = e.get("verificationNote", "")
        if note.startswith(PREFIX):
            note = note[len(PREFIX):]
        out.append({
            "id": qid,
            "bank": "brave",
            "sourceNumber": n,
            "topic": e["topic"],
            "type": "lab",
            "dragDrop": True,
            "question": e["question"],
            "exhibit": e.get("exhibitText") or "",
            "options": {},
            "correctAnswer": [],
            "solution": e["answer"],
            "explanation": "",
            "images": [],
            "optionImages": {},
            "flags": list(e.get("flags") or []),
            "confidence": e.get("confidence", ""),
            "needsVerification": bool(e.get("needsVerification")),
            "verificationNote": note,
        })
    n_dd = len(out)
    for e in data["questions"]:
        n = e["sourceNumber"]
        qid = "brave-%03d" % n
        if e.get("topic") not in topics:
            bad.append("%s: topic %r is not one of the NetForge topics" % (qid, e.get("topic")))
            continue
        ans = e.get("verifiedAnswer") or []
        if not ans:
            bad.append("%s: no verified answer" % qid)
            continue
        note = e.get("verificationNote", "")
        if note.startswith(PREFIX):
            note = note[len(PREFIX):]
        out.append({
            "id": qid,
            "bank": "brave",
            "sourceNumber": n,
            "topic": e["topic"],
            "type": "mcq",
            "question": e["question"],
            "exhibit": e.get("exhibitText") or "",
            "options": e["options"],
            "correctAnswer": list(ans),
            "explanation": "",
            "images": [],
            "optionImages": {},
            "flags": list(e.get("flags") or []),
            "sourceAnswer": list(e.get("sourceAnswer") or []),
            "communityAnswer": list(e.get("communityAnswer") or []),
            "communityVotes": e.get("communityVotesPercent") or {},
            "confidence": e.get("confidence", ""),
            "needsVerification": bool(e.get("needsVerification")),
            "verificationNote": note,
        })
    if bad:
        sys.exit("Fix these first:\n  " + "\n  ".join(bad))
    out.sort(key=lambda q: (q.get("dragDrop", False), q["sourceNumber"]))   # regular questions first, then drag & drop
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"questions": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    nv = sum(1 for q in out if q["needsVerification"])
    per = {}
    for q in out:
        per[q["topic"]] = per.get(q["topic"], 0) + 1
    print("Brave: %d questions + %d drag-and-drop items (%d marked 'needs verification') in %d topics" % (len(out) - n_dd, n_dd, nv, len(per)))
    for t, c in sorted(per.items(), key=lambda x: -x[1]):
        print("  %3d  %s" % (c, t))
    print("Saved %s" % OUT)
    print("Next: python tools/build.py")


if __name__ == "__main__":
    main()
