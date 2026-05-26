#!/usr/bin/env python3
"""Tiny SMTP sink for browser e2e tests.

It accepts messages and discards them. The app only needs a cooperative
SMTP peer so invoice-email e2e coverage can exercise the real endpoint
without reaching the cluster mail relay.
"""

from __future__ import annotations

import argparse
import socketserver


class SMTPHandler(socketserver.StreamRequestHandler):
    def write_line(self, line: str) -> None:
        self.wfile.write(f"{line}\r\n".encode("utf-8"))

    def handle(self) -> None:
        self.write_line("220 hillco2-e2e-smtp")
        in_data = False

        while True:
            raw = self.rfile.readline()
            if not raw:
                return
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")

            if in_data:
                if line == ".":
                    in_data = False
                    self.write_line("250 OK")
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=2525)
    args = parser.parse_args()

    with ThreadedSMTPServer((args.host, args.port), SMTPHandler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
