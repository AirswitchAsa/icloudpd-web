#!/usr/bin/env python3
"""Fake icloudpd CLI for tests.

Parses flags with argparse so that unknown flags cause a non-zero exit,
catching flag-name drift between our config_builder and the real binary.

Behavior driven by env vars:
  FAKE_ICLOUDPD_MODE: one of 'success', 'fail', 'slow', 'mfa'
  FAKE_ICLOUDPD_TOTAL: default 5
  FAKE_ICLOUDPD_SLEEP: seconds between progress lines (default 0.01)
"""

from __future__ import annotations

import argparse
import os
import sys
import time


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="fake_icloudpd",
        allow_abbrev=False,
        description="Fake icloudpd for testing",
    )
    # Required flags always emitted by build_argv
    p.add_argument("--username", required=True)
    p.add_argument("--directory", required=True)
    p.add_argument("--mfa-provider", dest="mfa_provider")
    p.add_argument("--password-provider", dest="password_provider")

    # Optional flags from policy.icloudpd dict (mirror REQUIRED_FLAGS in check_upstream.py)
    p.add_argument("--album")
    p.add_argument("--size", action="append")
    p.add_argument("--skip-videos", action="store_true")
    p.add_argument("--skip-live-photos", action="store_true")
    p.add_argument("--auth-only", action="store_true")
    p.add_argument("--recent", type=int)
    p.add_argument("--until-found", type=int)
    p.add_argument("--xmp-sidecar", action="store_true")
    p.add_argument("--auto-delete", action="store_true")
    p.add_argument("--folder-structure")
    p.add_argument("--set-exif-datetime", action="store_true")
    p.add_argument("--smtp-username")
    p.add_argument("--smtp-password")
    p.add_argument("--smtp-host")
    p.add_argument("--smtp-port", type=int)
    p.add_argument("--smtp-no-tls", action="store_true")
    p.add_argument("--notification-email")
    p.add_argument("--notification-email-from")
    p.add_argument("--notification-script")
    p.add_argument("--delete-after-download", action="store_true")
    p.add_argument("--keep-icloud-recent-days", type=int)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--skip-photos", action="store_true")
    p.add_argument("--skip-created-before")
    p.add_argument("--skip-created-after")
    p.add_argument("--live-photo-size")
    p.add_argument("--cookie-directory")
    p.add_argument("--list-albums", action="store_true")
    p.add_argument("--library")
    p.add_argument("--list-libraries", action="store_true")
    p.add_argument("--force-size", action="store_true")
    p.add_argument("--keep-unicode-in-filenames", action="store_true")
    p.add_argument("--file-match-policy")
    p.add_argument("--live-photo-mov-filename-policy")
    p.add_argument("--align-raw")
    p.add_argument("--log-level")
    p.add_argument("--domain")
    p.add_argument("--no-progress-bar", action="store_true")
    p.add_argument("--only-print-filenames", action="store_true")
    p.add_argument("--use-os-locale", action="store_true")
    p.add_argument("--watch-with-interval", type=int)
    return p


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    mode = os.environ.get("FAKE_ICLOUDPD_MODE", "success")
    total = int(os.environ.get("FAKE_ICLOUDPD_TOTAL", "5"))
    sleep = float(os.environ.get("FAKE_ICLOUDPD_SLEEP", "0.01"))

    print("INFO     starting", flush=True)

    # Read password from stdin (--password-provider console delivers it as a line).
    if args.password_provider == "console":
        _password = sys.stdin.readline().strip()  # consume; fake doesn't authenticate

    if mode == "mfa":
        print("INFO     Two-step authentication required.", flush=True)
        code = sys.stdin.readline().strip()
        if code:
            print(f"INFO     Received MFA code of length {len(code)}", flush=True)

    if mode == "fail":
        print("ERROR    something went wrong", file=sys.stderr, flush=True)
        return 2

    for i in range(1, total + 1):
        print(f"INFO     Downloading {i} of {total}", flush=True)
        time.sleep(sleep)
        if mode == "slow":
            time.sleep(0.5)

    print("INFO     done", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
