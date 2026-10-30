#!/usr/bin/env python3
"""buffer.py - push an approved draft into your Buffer channel for review.

Flow:  caption_gate PASS -> buffer.py submit -> review in Buffer UI -> publish.
Nothing posts automatically without --now.

Buffer API: GraphQL  https://api.buffer.com/graphql  (Bearer token)
The legacy REST API rejects current tokens and retires Feb 2027, so this tool
speaks GraphQL only.

Setup (once):
  buffer.com -> Account -> Settings -> API -> "Generate Access Token", then:
    python3 tools/buffer.py setup       (saves token, chmod 600)

Usage:
  python3 tools/buffer.py profiles                                   list channels
  python3 tools/buffer.py submit DRAFT.md                            save as draft (review in Buffer)
  python3 tools/buffer.py submit DRAFT.md --when "2026-11-02 09:00" schedule at local time
  python3 tools/buffer.py submit DRAFT.md --queue                    add to the channel queue
  python3 tools/buffer.py submit DRAFT.md --now                      post immediately (careful)
  python3 tools/buffer.py submit DRAFT.md --gate                     run caption_gate first
  python3 tools/buffer.py submit DRAFT.md --link https://…           attach a link
  python3 tools/buffer.py submit DRAFT.md --profile CHANNEL_ID       pick a channel (default: LinkedIn)
  python3 tools/buffer.py submit DRAFT.md --dry-run                  show the request only
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

API = "https://api.buffer.com/graphql"
TOKEN_FILE = Path.home() / ".config" / "buffer-token"
LINKEDIN_CHAR_LIMIT = 3000

MODE = {
    "draft": "shareNow",
    "queue": "addToQueue",
    "when": "customScheduled",
    "now": "shareNow",
}

FRAGMENTS = """
  ... on PostActionSuccess { post { id dueAt } }
  ... on NotFoundError { message }
  ... on UnauthorizedError { message }
  ... on UnexpectedError { message }
  ... on LimitReachedError { message }
  ... on InvalidInputError { message }
"""


class BufferError(Exception):
    pass


def gql(token: str, query: str) -> dict:
    req = urllib.request.Request(
        API,
        data=json.dumps({"query": query}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            data = json.loads(res.read().decode())
    except urllib.error.HTTPError as err:
        raise BufferError(f"HTTP {err.code} from Buffer: {err.read().decode(errors='replace')[:400]}") from err
    except urllib.error.URLError as err:
        raise BufferError(f"network error: {err.reason}") from err
    if data.get("errors"):
        msgs = "; ".join(e.get("message", str(e)) for e in data["errors"])
        raise BufferError(f"GraphQL error: {msgs}")
    return data.get("data", {})


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


def organization_id(token: str) -> str:
    data = gql(token, "{ account { organizations { id name } } }")
    orgs = (data.get("account") or {}).get("organizations") or []
    if not orgs:
        raise BufferError("No organization found for this account.")
    return orgs[0]["id"]


def list_channels(token: str):
    org = organization_id(token)
    data = gql(
        token,
        '{ channels(input: { organizationId: "%s" }) { id name service displayName type } }' % org,
    )
    return data.get("channels") or []


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
    if args.dry_run:
        print("[dry-run] GraphQL query: account -> organizations -> channels")
        return 0
    channels = list_channels(token)
    if not channels:
        print("No channels linked to this Buffer account.")
        return 1
    for c in channels:
        marker = "  <-- linkedin (default for submit)" if c.get("service") == "linkedin" else ""
        print(f"  {c['id']}  {c.get('service',''):<12} {c.get('displayName',''):<24} {c.get('name','')}{marker}")
    print(f"{len(channels)} channel(s). Use the id with --profile.")
    return 0


def cmd_submit(args) -> int:
    token = load_token(args)
    text = Path(args.draft).read_text(encoding="utf-8").strip()

    if len(text) > LINKEDIN_CHAR_LIMIT:
        print(f"FAIL: {len(text)} characters, LinkedIn posts are capped at {LINKEDIN_CHAR_LIMIT}. Trim the draft.")
        return 1

    if args.gate:
        gate = subprocess.run(
            [sys.executable, str(Path(__file__).parent / "caption_gate.py"), str(args.draft)],
            capture_output=True, text=True,
        ).stdout.splitlines()
        for line in gate:
            print(line)
        if any("FAIL" in r for r in gate):
            print("\nGate failed. Fix the draft before buffering it.")
            return 1
        print("Gate: PASS")

    # pick the LinkedIn channel by default
    if not args.profile:
        channels = list_channels(token)
        linkedin = next((c for c in channels if c.get("service") == "linkedin"), None)
        if not linkedin:
            raise BufferError("No LinkedIn channel found. Pass --profile <channel-id> to pick another.")
        args.profile = linkedin["id"]
        print(f"Using LinkedIn channel: {linkedin.get('displayName')} ({args.profile})")

    save_to_draft = args.draft_flag or not (args.when or args.queue or args.now)
    mode = MODE["when"] if args.when else (MODE["queue"] if args.queue else (MODE["now"] if args.now else MODE["draft"]))
    due_at = None
    if args.when:
        try:
            dt = datetime.strptime(args.when, "%Y-%m-%d %H:%M").astimezone()
        except ValueError as err:
            raise BufferError('--when format: "YYYY-MM-DD HH:MM" (your local timezone)') from err
        if dt <= datetime.now().astimezone() + timedelta(minutes=5):
            raise BufferError("--when must be at least 5 minutes in the future.")
        due_at = dt.isoformat(timespec="seconds")

    assets = "[]"
    if args.link:
        assets = json.dumps([{"document": {"url": args.link}}])

    input_fields = {
        "channelId": args.profile,
        "text": json.dumps(text),
        "assets": assets,
        "tagIds": "[]",
        "mode": mode,
        "schedulingType": "automatic",
        "needsApproval": "false",
        "saveToDraft": "true" if save_to_draft else "false",
    }
    if due_at:
        input_fields["dueAt"] = json.dumps(due_at)
    fields = "\n".join(f"    {k}: {v}" for k, v in input_fields.items())
    query = "mutation {\n  createPost(input: {\n%s\n  }) {\n%s  }\n}" % (fields, FRAGMENTS)

    if args.dry_run:
        print("[dry-run] POST", API)
        print("[dry-run] mutation createPost(input: {")
        for k, v in input_fields.items():
            shown = v if "text" not in k else f"<{len(text)} chars>"
            print(f"  {k}: {shown}")
        print("  })")
        return 0

    data = gql(token, query)
    result = data.get("createPost") or {}
    if "post" in result:
        post = result["post"]
        when = "draft" if save_to_draft else (due_at or ("queue" if args.queue else "now"))
        print(f"OK: post sent to Buffer as {when}.")
        print(f"post id: {post['id']}")
        if post.get("dueAt"):
            print(f"scheduled for: {post['dueAt']}")
        print("Review it in the Buffer drafts/queue UI.")
    elif result.get("message"):
        raise BufferError(result["message"])
    else:
        raise BufferError(f"unexpected response: {json.dumps(result)[:200]}")
    return 0


def main(argv) -> int:
    parser = argparse.ArgumentParser(description="Buffer publisher for the LinkedIn AI OS (GraphQL)")
    parser.add_argument("--token", help="Buffer access token (or BUFFER_ACCESS_TOKEN env)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_setup = sub.add_parser("setup", help="save your Buffer access token")
    p_setup.set_defaults(func=cmd_setup)

    p_profiles = sub.add_parser("profiles", help="list linked Buffer channels")
    p_profiles.add_argument("--dry-run", action="store_true")
    p_profiles.set_defaults(func=cmd_profiles)

    p_submit = sub.add_parser("submit", help="push a draft into Buffer")
    p_submit.add_argument("draft", help="path to the approved draft file")
    p_submit.add_argument("--profile", help="Buffer channel id (default: LinkedIn channel)")
    p_submit.add_argument("--when", help='"YYYY-MM-DD HH:MM" local time, schedules the post')
    p_submit.add_argument("--queue", action="store_true", help="add to the channel queue")
    p_submit.add_argument("--now", action="store_true", help="post immediately (careful)")
    p_submit.add_argument("--draft", dest="draft_flag", action="store_true", help="save as draft (default behavior)")
    p_submit.add_argument("--gate", action="store_true", help="run caption_gate.py first")
    p_submit.add_argument("--link", help="attach a link (document asset)")
    p_submit.add_argument("--dry-run", action="store_true")
    p_submit.set_defaults(func=cmd_submit)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except BufferError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
