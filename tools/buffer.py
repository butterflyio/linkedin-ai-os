#!/usr/bin/env python3
"""buffer.py - push an approved draft into your Buffer queue for review.

Flow:  caption_gate PASS -> buffer.py submit -> review/schedule in Buffer UI
       -> publish. Nothing auto-publishes.

Buffer API: v1 REST  https://api.bufferapp.com/1/

Setup (once):
  1. buffer.com -> Account -> Settings -> API -> "Generate Access Token"
  2. Provide the token via BUFFER_ACCESS_TOKEN env, --token, or run:
       python3 tools/buffer.py setup
     (setup saves the token to ~/.config/buffer-token, chmod 600)

Usage:
  python3 tools/buffer.py profiles                     list linked profiles
  python3 tools/buffer.py submit DRAFT.md              queue now (pending review)
  python3 tools/buffer.py submit DRAFT.md --when "2026-11-02 09:00"
                                                      schedule at local time
  python3 tools/buffer.py submit DRAFT.md --draft     save as draft, no queue
  python3 tools/buffer.py submit DRAFT.md --gate      run caption_gate first
  python3 tools/buffer.py submit DRAFT.md --link https://…   attach a link
  python3 tools/buffer.py submit DRAFT.md --dry-run   show the request, don't send
  python3 tools/buffer.py profiles --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

API = "https://api.bufferapp.com/1"
TOKEN_FILE = Path.home() / ".config" / "buffer-token"
LINKEDIN_CHAR_LIMIT = 3000


class BufferError(Exception):
    pass


def api(path: str, params: dict, method: str = "GET") -> dict:
    params = {k: v for k, v in params.items() if v is not None and v != ""}
    if method == "GET":
        qs = urllib.parse.urlencode(params)
        url = f"{API}{path}?{qs}"
        req = urllib.request.Request(url)
    else:
        url = f"{API}{path}"
        req = urllib.request.Request(url, data=urllib.parse.urlencode(params).encode(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as err:
        body = err.read().decode(errors="replace")[:400]
        raise BufferError(f"HTTP {err.code} from Buffer: {body}") from err
    except urllib.error.URLError as err:
        raise BufferError(f"network error: {err.reason}") from err


def load_token(args) -> str:
    token = args.token or os.environ.get("BUFFER_ACCESS_TOKEN", "")
    if not token and TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text().strip()
    if not token:
        raise BufferError(
            "No Buffer access token. Set BUFFER_ACCESS_TOKEN, pass --token, "
            "or run 'python3 tools/buffer.py setup'."
        )
    return token


def cmd_setup(_args) -> int:
    token = input("Paste your Buffer access token (not printed back): ").strip()
    if not token:
        print("No token entered.")
        return 1
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(token)
    TOKEN_FILE.chmod(0o600)
    print(f"Token saved to {TOKEN_FILE} (chmod 600).")
    return 0


def cmd_profiles(args) -> int:
    token = load_token(args)
    params = {"access_token": token}
    if args.dry_run:
        print("[dry-run] GET", f"{API}/profiles.json", {"access_token": "***"})
        return 0
    data = api("/profiles.json", params)
    profiles = data if isinstance(data, list) else data.get("data", [])
    if not profiles:
        print("No profiles linked to this Buffer account.")
        return 1
    for p in profiles:
        print(f"  {p['id']}  {p.get('service', ''):<10} {p.get('formatted_username', p.get('name', ''))}")
    print(f"{len(profiles)} profile(s). Use the id with --profile.")
    return 0


def cmd_submit(args) -> int:
    token = load_token(args)
    text = Path(args.draft).read_text(encoding="utf-8").strip()

    if len(text) > LINKEDIN_CHAR_LIMIT:
        print(f"FAIL: {len(text)} characters, LinkedIn posts are capped at {LINKEDIN_CHAR_LIMIT}. Trim the draft.")
        return 1

    if args.gate:
        gate = [r for r in run_gate(Path(args.draft))]
        for line in gate:
            print(line)
        if any("FAIL" in r for r in gate):
            print("\nGate failed. Fix the draft before buffering it.")
            return 1
        print("Gate: PASS")

    params = {
        "access_token": token,
        "profile_ids[]": args.profile,
        "text": text,
        "shorten": "false",
    }
    if args.link:
        params["media[link]"] = args.link
    if args.draft:
        params["draft"] = "true"
    if args.when:
        try:
            dt = datetime.strptime(args.when, "%Y-%m-%d %H:%M")
        except ValueError as err:
            raise BufferError('--when format: "YYYY-MM-DD HH:MM" in your local timezone') from err
        if dt <= datetime.now() + timedelta(minutes=5):
            raise BufferError("--when must be at least 5 minutes in the future.")
        params["scheduled_at"] = str(int(dt.timestamp()))

    if args.dry_run:
        safe = {k: ("***" if "token" in k else v) for k, v in params.items()}
        print("[dry-run] POST", f"{API}/updates/create.json", safe)
        print(f"[dry-run] text ({len(text)} chars):\n\n{text[:300]}{'...' if len(text) > 300 else ''}")
        return 0

    data = api("/updates/create.json", params, method="POST")
    update = data if isinstance(data, dict) else {}
    url = update.get("url") or (update.get("updates") or [{}])[0].get("url", "")
    when = args.when or ("draft" if args.draft else "immediately (pending review)")
    print(f"OK: update sent to Buffer, {when}.")
    if url:
        print(f"Review it: {url}")
    return 0


def run_gate(path: Path):
    """Reuse caption_gate.py as a subprocess."""
    import subprocess

    proc = subprocess.run([sys.executable, str(Path(__file__).parent / "caption_gate.py"), str(path)], capture_output=True, text=True)
    return proc.stdout.splitlines()


def main(argv) -> int:
    parser = argparse.ArgumentParser(description="Buffer publisher for the LinkedIn AI OS")
    parser.add_argument("--token", help="Buffer access token (or BUFFER_ACCESS_TOKEN env)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_setup = sub.add_parser("setup", help="save your Buffer access token")
    p_setup.set_defaults(func=cmd_setup)

    p_profiles = sub.add_parser("profiles", help="list linked Buffer profiles")
    p_profiles.add_argument("--dry-run", action="store_true")
    p_profiles.set_defaults(func=cmd_profiles)

    p_submit = sub.add_parser("submit", help="push a draft into Buffer")
    p_submit.add_argument("draft", help="path to the approved draft file")
    p_submit.add_argument("--profile", help="Buffer profile id (default: first profile)")
    p_submit.add_argument("--when", help='"YYYY-MM-DD HH:MM" local time, or leave empty for review queue')
    p_submit.add_argument("--draft", action="store_true", help="save as draft, do not queue")
    p_submit.add_argument("--gate", action="store_true", help="run caption_gate.py first")
    p_submit.add_argument("--link", help="attach a link (media[link])")
    p_submit.add_argument("--dry-run", action="store_true")
    p_submit.set_defaults(func=cmd_submit)

    args = parser.parse_args(argv)
    try:
        if args.command == "submit" and not args.profile:
            # lazily resolve the first profile so submit works without config
            token = load_token(args)
            if not args.dry_run and not args.profile:
                data = api("/profiles.json", {"access_token": token})
                profiles = data if isinstance(data, list) else data.get("data", [])
                if not profiles:
                    raise BufferError("No profiles linked. Run 'python3 tools/buffer.py profiles'.")
                args.profile = profiles[0]["id"]
                print(f"Using first profile: {args.profile}")
        return args.func(args)
    except BufferError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
