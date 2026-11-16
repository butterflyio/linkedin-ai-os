#!/usr/bin/env python3
"""hooks.py - research the best hooks for a niche using Perplexity (grounded).

For a give topic, it pulls high-engagement hook styles + realistic example
hooks in the last 7 days, mapped to the hook formulas we already use in
skills/hook-generator. Saves research/hooks-<date>.md.

Usage:
  python3 research/hooks.py --topic "personal branding websites for founders"
  (needs PERPLEXITY_API_KEY from research/.env; install-free, uses curl)
"""
import argparse, datetime, json, os, re, subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def load_env():
    for l in (ROOT / "research" / ".env").read_text().splitlines() if (ROOT / "research" / ".env").exists() else []:
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", l)
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")


def ppl(messages, key, max_tokens=900):
    body = json.dumps({"model": "perplexity/sonar", "input": messages, "max_output_tokens": max_tokens}).encode()
    out = subprocess.run(["curl", "-sL", "-m", "60", "-X", "POST", "https://api.perplexity.ai/v1/responses",
                          "-H", f"Authorization: Bearer {key}", "-H", "Content-Type: application/json", "-d", body],
                         capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
        ot = d.get("output") or d.get("output_text") or []
        if isinstance(ot, str):
            return ot
        return "\n".join(c.get("text", "") for m in ot for c in (m.get("content") or []) if c.get("type") == "output_text")
    except Exception:
        return ""


def main():
    ap = argparse.ArgumentParser(description="Hook research for a niche")
    ap.add_argument("--topic", default="personal branding websites for founders (agentic AI backend)")
    ap.add_argument("--count", type=int, default=8)
    args = ap.parse_args()
    load_env()
    key = os.environ.get("PERPLEXITY_API_KEY")
    if not key:
        print("PERPLEXITY_API_KEY missing (research/setup-keys.sh)")
        return 1
    prompt = (
        f"Research the strongest LinkedIn hooks for this niche: '{args.topic}'.\n"
        "Ground in what is actually performing right now (last 7 days when possible).\n"
        "Reply with: (1) 3 hook formulas that work for this niche (named, with a 1-line explanation),\n"
        "and (2) {0} concrete example hook lines, in first person, specific, under 55 chars each,\n"
        "each tagged with its formula. Be realistic, avoid cliches and banned AI words\n"
        "(game-changer, revolutionar, unlock, leverage, seamless, powerful, innovative, etc).\n"
        "Separate the two sections with a blank line; keep it skimmable.".format(args.count)
    )
    result = ppl([
        {"role": "system", "content": [{"type": "input_text", "text": "You are a LinkedIn growth strategist. Be specific, evidence-first, no hype."}]},
        {"role": "user", "content": [{"type": "input_text", "text": prompt}]},
    ], key)
    date = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    txt = f"# Hook research - {args.topic}\n\nAs of {date}\n\n" + result
    out = ROOT / "research" / f"hooks-{date}.md"
    out.write_text(txt)
    print(txt)
    print("\n[wrote]", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())