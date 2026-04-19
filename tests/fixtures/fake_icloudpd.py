#!/usr/bin/env python3
"""Fake icloudpd CLI for tests.

Behavior driven by env vars:
  FAKE_ICLOUDPD_MODE: one of 'success', 'fail', 'slow', 'mfa'
  FAKE_ICLOUDPD_TOTAL: default 5
  FAKE_ICLOUDPD_SLEEP: seconds between progress lines (default 0.01)
  FAKE_ICLOUDPD_MFA_CALLBACK: path to a file; when present its first line is the code
"""

from __future__ import annotations

import os
import sys
import time


def main() -> int:
    mode = os.environ.get("FAKE_ICLOUDPD_MODE", "success")
    total = int(os.environ.get("FAKE_ICLOUDPD_TOTAL", "5"))
    sleep = float(os.environ.get("FAKE_ICLOUDPD_SLEEP", "0.01"))

    print("INFO     starting", flush=True)

    if mode == "mfa":
        cb = os.environ.get("FAKE_ICLOUDPD_MFA_CALLBACK", "")
        print("INFO     Two-step authentication required.", flush=True)
        while True:
            if cb and os.path.isfile(cb):
                with open(cb) as f:
                    code = f.read().strip()
                if code:
                    print(f"INFO     Received MFA code of length {len(code)}", flush=True)
                    break
            time.sleep(0.05)

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
