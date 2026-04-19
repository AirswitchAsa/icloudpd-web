"""Opt-in syntax gate: spawn the real icloudpd binary with our argv and verify
it accepts every flag we emit. This is the only test that actually invokes
icloudpd. It does NOT require iCloud credentials — we feed a bogus password
and expect authentication to fail cleanly.

Run explicitly:

    ICLOUDPD_REAL_TEST=1 uv run pytest tests/runner/test_real_icloudpd_syntax.py -v

Skipped by default so regular `pytest` stays hermetic.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys

import pytest

from icloudpd_web.runner.config_builder import build_argv
from icloudpd_web.store.models import Policy


pytestmark = pytest.mark.skipif(
    os.environ.get("ICLOUDPD_REAL_TEST") != "1",
    reason="Opt-in: set ICLOUDPD_REAL_TEST=1 to exercise the real icloudpd binary.",
)


# Markers that mean argparse rejected our argv. If any of these show up,
# our wrapper is emitting flags the real binary doesn't understand.
ARGPARSE_REJECTION_MARKERS = (
    "unrecognized arguments",
    "error: argument",
    "invalid choice",
    "expected one argument",
    "the following arguments are required",
)


def _run_real_icloudpd(
    argv_tail: list[str], password: str, timeout: float = 45.0
) -> subprocess.CompletedProcess:
    bin_path = shutil.which("icloudpd")
    assert bin_path, "icloudpd not on PATH"
    proc = subprocess.run(
        [bin_path, *argv_tail],
        input=password + "\n",
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return proc


def test_real_icloudpd_accepts_our_argv_for_populated_policy() -> None:
    """Every flag build_argv emits for a maximally-populated policy must be
    accepted by real icloudpd. We add --auth-only so the call stays short."""
    policy = Policy(
        name="p",
        username="nobody@example.invalid",
        directory="/tmp/nonexistent-icloudpd-test",
        cron="0 * * * *",
        enabled=True,
        icloudpd={
            "domain": "com",
            "folder_structure": "{:%Y/%m/%d}",
            "size": ["original"],
            "live_photo_size": "original",
            "align_raw": "original",
            "live_photo_mov_filename_policy": "suffix",
            "file_match_policy": "name-size-dedup-with-suffix",
            "library": "PrimarySync",
            "skip_videos": True,
            "dry_run": True,
            "log_level": "info",
            "threads_num": 2,
        },
    )
    argv = build_argv(policy) + ["--auth-only"]
    proc = _run_real_icloudpd(argv, password="not-a-real-password")

    combined = (proc.stdout + proc.stderr).lower()
    for marker in ARGPARSE_REJECTION_MARKERS:
        assert marker not in combined, (
            f"real icloudpd rejected our argv:\n"
            f"  marker: {marker!r}\n"
            f"  argv:   {argv}\n"
            f"  output: {combined[:2000]}"
        )

    # Positive signal: we got far enough to attempt auth.
    # (Either "Authenticating" log line, or an auth-related error.)
    assert any(
        needle in combined
        for needle in (
            "authenticating",
            "invalid email",
            "password",
            "icloud",
            "processing user",
        )
    ), f"icloudpd never reached auth; output:\n{combined[:2000]}"


def test_real_icloudpd_rejects_an_obviously_bad_flag() -> None:
    """Sanity check on the test itself: if we pass garbage, the rejection
    markers do fire. If this test fails, ARGPARSE_REJECTION_MARKERS needs
    updating for the current icloudpd version."""
    proc = _run_real_icloudpd(
        [
            "--username",
            "x",
            "--directory",
            "/tmp/x",
            "--password-provider",
            "console",
            "--mfa-provider",
            "console",
            "--auth-only",
            "--not-a-real-flag-at-all",
        ],
        password="x",
    )
    combined = (proc.stdout + proc.stderr).lower()
    assert any(m in combined for m in ARGPARSE_REJECTION_MARKERS), combined[:500]


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
