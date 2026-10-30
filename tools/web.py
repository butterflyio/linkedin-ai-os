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

    def do_POST(self):
        if self.path != "/api/save":
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            self.send_error(400, "bad json")
            return
        with open(os.path.join(SAVE_DIR, FILE), "w") as f:
            json.dump(payload, f, indent=2)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok": true}')

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