#!/usr/bin/env python3
"""tools/web.py - local static server + tiny save endpoint for the repo.

Serves the repo at http://localhost:8181 (editor, gate UI, infographics) and
adds:
  GET  /api/approvals  -> research/gate-approvals.json
  POST /api/save       -> write approvals from the gate UI

Secrets guard: dot-paths and .env files are never served.
"""
import http.server
import json
import socket
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVE_DIR = os.path.join(ROOT, "research")
FILE = "gate-approvals.json"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def _blocked(self, path):
        parts = path.lstrip("/").split("/")
        return any(p.startswith(".") for p in parts) or any(".env" in p for p in parts)

    def do_GET(self):
        if self.path.startswith("/api/approvals"):
            data = {}
            p = os.path.join(SAVE_DIR, FILE)
            if os.path.exists(p):
                try:
                    data = json.load(open(p))
                except Exception:
                    data = {}
            body = json.dumps(data).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self._blocked(self.path):
            self.send_error(403, "not allowed")
            return
        return super().do_GET()

    def _read_key(self, name):
        p = os.path.join(ROOT, "research", ".env")
        try:
            for line in open(p):
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass
        return os.environ.get(name, "")

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path not in ("/api/save", "/api/summarize"):
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            self.send_error(400, "bad json")
            return
        if self.path == "/api/save":
            with open(os.path.join(SAVE_DIR, FILE), "w") as f:
                json.dump(payload, f, indent=2)
            self._json(200, {"ok": True})
            return
        # /api/summarize - Perplexity on-demand summary for one row
        key = self._read_key("PERPLEXITY_API_KEY")
        if not key:
            self._json(400, {"error": "PERPLEXITY_API_KEY not set in research/.env"})
            return
        import subprocess
        import re as _re
        title = str(payload.get("title", ""))
        url = str(payload.get("url", ""))
        body = json.dumps({
            "model": "perplexity/sonar",
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": "Summarise this news item for a Linkedin creator (AI agents, Web3 search visibility, AI safety). Reply with ONE JSON object only: {\"summary\": \"2-4 sentences\", \"key_points\": [\"…\", \"…\"], \"relevance\": \"one short founder-relevant reason\"}. If the URL looks unreliable or unreachable, say so plainly inside summary."}]},
                {"role": "user", "content": [{"type": "input_text", "text": f"Title: {title}\nURL: {url}"}]},
            ],
            "max_output_tokens": 420,
        }).encode()
        out = subprocess.run(["curl", "-sL", "-m", "60", "-X", "POST", "https://api.perplexity.ai/v1/responses",
                              "-H", f"Authorization: Bearer {key}", "-H", "Content-Type: application/json", "-d", body],
                             capture_output=True, text=True).stdout
        try:
            d = json.loads(out)
            ot = d.get("output") or d.get("output_text") or []
            if isinstance(ot, str):
                content = ot
            else:
                content = "".join(c.get("text", "") for m in ot for c in (m.get("content") or []) if c.get("type") == "output_text")
            m = _re.search(r"\{.*\}", content, _re.S)
            parsed = json.loads(m.group(0)) if m else {}
            if not parsed:
                parsed = {"summary": content[:600]}
            self._json(200, {"summary": parsed.get("summary", ""), "key_points": parsed.get("key_points", []), "relevance": parsed.get("relevance", "")})
        except Exception as e:
            self._json(500, {"error": str(e)[:200]})

    def log_message(self, *args):
        pass


HOST = socket.gethostbyname("localhost")

socket_server_class = socketserver.ThreadingTCPServer
socket_server_class.allow_reuse_address = True

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8181
    with socketserver.ThreadingTCPServer((HOST, port), Handler) as httpd:
        httpd.daemon_threads = True
        print(f"serving {ROOT} on http://localhost:{port}")
        httpd.serve_forever()