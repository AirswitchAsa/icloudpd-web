from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path

from icloudpd_web.auth import Authenticator


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="icloudpd-web")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--data-dir", default=str(Path.home() / ".icloudpd-web"))
    parser.add_argument("--password-hash", default=os.environ.get("ICLOUDPD_WEB_PASSWORD_HASH"))
    parser.add_argument("--session-secret", default=os.environ.get("ICLOUDPD_WEB_SESSION_SECRET"))

    sub = parser.add_subparsers(dest="cmd")
    init_pw = sub.add_parser("init-password", help="Hash a password and print it")
    init_pw.add_argument("password")

    args = parser.parse_args(argv)

    if args.cmd == "init-password":
        print(Authenticator.hash(args.password))
        return 0

    if not args.password_hash:
        print(
            "error: provide --password-hash or set ICLOUDPD_WEB_PASSWORD_HASH",
            file=sys.stderr,
        )
        return 2

    session_secret = args.session_secret or secrets.token_urlsafe(32)

    import uvicorn

    from icloudpd_web.app import create_app

    app = create_app(
        data_dir=Path(args.data_dir),
        authenticator=Authenticator(password_hash=args.password_hash),
        session_secret=session_secret,
    )
    uvicorn.run(app, host=args.host, port=args.port)
    return 0
