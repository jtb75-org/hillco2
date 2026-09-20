#!/usr/bin/env python3
"""Tiny SMTP sink for browser e2e tests.

It accepts messages and, by default, discards them. The app only needs a
cooperative SMTP peer so invoice-email e2e coverage can exercise the real
endpoint without reaching the cluster mail relay.

With ``--out DIR`` each accepted message is also written to that directory
so a test can read what the app sent — e.g. pull the tokenized link out of
a "please sign" email and drive the public signing page with it. Two files
per message, named by arrival time in nanoseconds:

  <ns>.eml   the raw RFC 5322 message
  <ns>.txt   ``To:`` and ``Subject:`` headers, then the DECODED text/plain
             and text/html bodies (quoted-printable / base64 undone, so a
             long URL is never soft-wrapped mid-token)
"""

from __future__ import annotations

import argparse
import email
import email.policy
import socketserver
import time
from pathlib import Path

OUT_DIR: Path | None = None


def _write_message(raw: bytes) -> None:
    assert OUT_DIR is not None
    stamp = time.time_ns()
    (OUT_DIR / f"{stamp}.eml").write_bytes(raw)

    msg = email.message_from_bytes(raw, policy=email.policy.default)
    parts = [f"To: {msg.get('To', '')}", f"Subject: {msg.get('Subject', '')}", ""]
    for part in msg.walk():
        if part.get_content_type() in ("text/plain", "text/html"):
            try:
                parts.append(part.get_content())
            except Exception:  # pragma: no cover - malformed part
                parts.append(part.get_payload(decode=True).decode("utf-8", "replace"))
    (OUT_DIR / f"{stamp}.txt").write_text("\n".join(parts), encoding="utf-8")


class SMTPHandler(socketserver.StreamRequestHandler):
    def write_line(self, line: str) -> None:
        self.wfile.write(f"{line}\r\n".encode())

    def handle(self) -> None:
        self.write_line("220 hillco2-e2e-smtp")
        in_data = False
        data: list[bytes] = []

        while True:
            raw = self.rfile.readline()
            if not raw:
                return
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")

            if in_data:
                if line == ".":
                    in_data = False
                    if OUT_DIR is not None:
                        _write_message(b"".join(data))
                    data = []
                    self.write_line("250 OK")
                else:
                    # Undo SMTP dot-stuffing.
                    data.append(raw[1:] if raw.startswith(b"..") else raw)
                continue

            command = line.split(" ", 1)[0].upper()
            if command in {"EHLO", "HELO"}:
                self.write_line("250-hillco2-e2e-smtp")
                self.write_line("250 OK")
            elif command in {"MAIL", "RCPT", "RSET", "NOOP"}:
                self.write_line("250 OK")
            elif command == "DATA":
                in_data = True
                self.write_line("354 End data with <CR><LF>.<CR><LF>")
            elif command == "QUIT":
                self.write_line("221 Bye")
                return
            else:
                self.write_line("250 OK")


class ThreadedSMTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


def main() -> None:
    global OUT_DIR
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=2525)
    parser.add_argument("--out", help="directory to write accepted messages to")
    args = parser.parse_args()
    if args.out:
        OUT_DIR = Path(args.out)
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    with ThreadedSMTPServer((args.host, args.port), SMTPHandler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
