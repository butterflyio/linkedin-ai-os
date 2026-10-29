#!/usr/bin/env python3
"""caption_gate.py - LinkedIn post pre-publish gate for Zain's voice.

Reads a draft (markdown or text) and prints FAIL/PASS per rule. Exits 0 if all
pass, 1 if any fail. This is the programmatic half of post-scorer.

Usage:  python3 caption_gate.py draft.md
"""

from __future__ import annotations
import re
import sys
from pathlib import Path

# --- Rules ---------------------------------------------------------------

# Words that read like AI wrote them (subset of the 35 Wikipedia signs).
BANNED_WORDS = {
    "game-changer", "game changing", "revolutionary", "groundbreaking",
    "unlock", "unlocking", "delve", "delve into", "leveraging", "leverage",
    "seamless", "powerful", "robust", "cutting-edge", "cutting edge",
    "landmark", "testament", "pivotal", "innovative", "groundbreaking",
    "nestled", "vibrant", "fostering", "foster", "underscores", "underscore",
    "symbolizing", "tapestry", "evolving landscape", "cultivate", "garner",
    "renowned", "breathtaking", "must-visit", "vital role",
}

# Words I hedge with; contests directness.
HEDGE_WORDS = ["i believe", "i think", "in my opinion", "arguably",
               "it seems", "one could argue", "maybe", "perhaps"]

HOOK_MAX_CHARS = 55          # first line must read whole on mobile
MAX_SENTENCE_WORDS = 40      # very long sentences lose the short-line rhythm

RE_EMDASH = re.compile(r"[\u2014\u2015\u2013]")  # em/en dashes
RE_LIST = re.compile(r"(^|\n)[-*]\s+")            # markdown bullets in prose


def check_hook(text: str):
    first = text.strip().splitlines()[0].strip() if text.strip() else ""
    if not first:
        return "FAIL: Draft is empty."
    if len(first) > HOOK_MAX_CHARS:
        return (f"FAIL: Hook line 1 is {len(first)} characters, over "
                f"{HOOK_MAX_CHARS}. It must read whole in the mobile preview.")
    return "PASS: Hook fits mobile preview."


def check_emdash(text: str):
    m = RE_EMDASH.search(text)
    if m:
        return "FAIL: Em/en dash found. Use a comma or a full stop."
    return "PASS: No em/en dashes."


def check_banned(text: str):
    low = text.lower()
    hits = [w for w in BANNED_WORDS if re.search(r"\b%s\b" % re.escape(w), low)]
    if hits:
        return "FAIL: Banned word(s): " + ", ".join(sorted(set(hits))) + "."
    return "PASS: No banned AI words."


def check_hedges(text: str):
    low = text.lower()
    hits = [w for w in HEDGE_WORDS if re.search(r"\b%s\b" % re.escape(w), low)]
    if hits:
        return "FAIL: Hedging word(s) weaken the voice: " + ", ".join(hits) + "."
    return "PASS: Direct voice."


def check_punctuation(text: str):
    # detect a closing unspaced parenthesis or missing space after punctuation
    bad = re.findall(r"[)\w]\(", text)
    if bad:
        return "FAIL: Missing space before parenthesis: '" + bad[0] + "'."
    return "PASS: Punctuation spacing OK."


def run_checks(text: str) -> list[str]:
    checks = [
        ("HOOK", check_hook(text)),
        ("DASH", check_emdash(text)),
        ("BANNED", check_banned(text)),
        ("HEDGE", check_hedges(text)),
        ("SPACE", check_punctuation(text)),
    ]
    return [f"[{name}] {msg}" for name, msg in checks]


def validate(text: str) -> bool:
    results = run_checks(text)
    passed = all(r.startswith("[") and "PASS" in r for r in results)
    for r in results:
        print(r)
    return passed


def main(argv):
    if len(argv) != 2:
        print("usage: caption_gate.py DRAFT_FILE")
        return 2
    path = Path(argv[1])
    if not path.exists():
        print(f"error: no such file: {path}")
        return 2
    text = path.read_text(encoding="utf-8")
    ok = validate(text)
    print("\n" + ("All checks passed." if ok else "Failures. Fix and re-run."))
    return 0 if ok else 1


def demo():
    """Runnable self-check. Fails if a rule regresses."""
    good = ("I caught my agent agreeing with a wrong answer.\n"
            "It was not the first time.\n"
            "That is why I started studying AI safety.\n"
            "This is why I got hands on with alignment.")
    bad = ("We have witnessed some phenomenal, game-changing breakthroughs "
           "that UNLOCK the evolving landscape of AI -- a testament to "
           "innovation\u2014and I believe this(actually)works.")
    assert validate(good) is True, "good draft should pass"
    bad_fail = validate(bad) is False
    assert bad_fail, "bad draft must fail"
    print("\ndemo(): PASS")


if __name__ == "__main__":
    if "--demo" in sys.argv:
        demo()
        sys.exit(0)
    sys.exit(main(sys.argv))