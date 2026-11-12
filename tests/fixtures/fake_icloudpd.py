#!/usr/bin/env python3
"""Fake icloudpd CLI for tests.

Parses flags with argparse so that unknown flags cause a non-zero exit,
catching flag-name drift between our config_builder and the real binary.

Faithful to the real icloudpd 1.32.3 console flow:
  - password prompt uses getpass (reads /dev/tty when a controlling
    terminal exists; falls back to stdin otherwise)
  - MFA prompt lines are exactly "Two-factor authentication is required (2fa)"
    / "Two-step authentication is required (2sa)"
  - a successful code logs a multi-line banner containing the line
    "the two-factor authentication expires."
  - a rejected code logs "Failed to verify two-factor authentication code"
    and EXITS with code 1 (no re-prompt)
  - "Downloaded <path>" INFO lines middle-truncate paths >96 chars with "..."

Behavior driven by env vars:
  FAKE_ICLOUDPD_MODE: one of 'success', 'fail', 'slow', 'mfa', 'mfa_reject',
    'mfa_2sa', 'bad_password', 'wrong_domain', 'filter_demo'
  FAKE_ICLOUDPD_TOTAL: default 5
  FAKE_ICLOUDPD_SLEEP: seconds between progress lines (default 0.01)
  FAKE_ICLOUDPD_DIR: target directory for filter_demo mode
  FAKE_ICLOUDPD_NESTED: "1" puts filter_demo files in date-style subfolders
"""

from __future__ import annotations

import argparse
import os
import struct
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


def _print_mfa_success_banner() -> None:
    """The multi-line banner real icloudpd 1.32.3 logs after a code is accepted."""
    print("INFO     Great, you're all set up. The script can now be run without", flush=True)
    print("INFO     user interaction until 2SA/2FA is expired.", flush=True)
    print("INFO     You can set up email notifications for when", flush=True)
    print("INFO     the two-factor authentication expires.", flush=True)
    print("INFO     (Use --help to view information about SMTP options.)", flush=True)


def main() -> int:  # noqa: C901, PLR0911, PLR0912
    parser = _build_parser()
    args = parser.parse_args()

    mode = os.environ.get("FAKE_ICLOUDPD_MODE", "success")
    total = int(os.environ.get("FAKE_ICLOUDPD_TOTAL", "5"))
    sleep = float(os.environ.get("FAKE_ICLOUDPD_SLEEP", "0.01"))

    print("INFO     starting", flush=True)

    if args.password_provider == "console":
        # Real icloudpd's console provider uses getpass, which reads
        # /dev/tty when a controlling terminal exists and only falls back
        # to stdin without one (this is why the wrapper must detach the
        # child from the tty via start_new_session).
        import getpass

        _password = getpass.getpass("Enter iCloud password: ")

    if mode == "wrong_domain":
        print(
            "ERROR    PyiCloudConnectionException: Apple insists on using "
            "iCloud.com.cn for your request. Please use --domain parameter",
            file=sys.stderr,
            flush=True,
        )
        return 1

    if getattr(args, "list_libraries", False):
        # Mirror real icloudpd: print library names, one per line, then exit 0.
        print("PrimarySync", flush=True)
        extra = os.environ.get("FAKE_ICLOUDPD_SHARED_LIB")
        if extra:
            print(extra, flush=True)
        return 0

    if mode == "mfa":
        print("Two-factor authentication is required (2fa)", flush=True)
        code = sys.stdin.readline().strip()
        if code:
            _print_mfa_success_banner()

    if mode == "mfa_reject":
        # Real 1.32.3 EXITS on a rejected code — there is no console re-prompt.
        print("Two-factor authentication is required (2fa)", flush=True)
        _code = sys.stdin.readline().strip()
        print("ERROR    Failed to verify two-factor authentication code", flush=True)
        return 1

    if mode == "mfa_2sa":
        # Legacy two-step auth prompts for a trusted-device INDEX and loops
        # on input() — a single 6-digit code can never answer it.
        print("Two-step authentication is required (2sa)", flush=True)
        print("  0: SMS to *******12", flush=True)
        print("Please choose an option: [0]: ", flush=True)
        while True:
            line = sys.stdin.readline()
            if not line:  # stdin closed; parent killed us or gave up
                return 1
            print("Please choose an option: [0]: ", flush=True)

    if mode == "bad_password":
        # Real icloudpd logs this and exits 1 when Apple rejects the password.
        print("ERROR    Invalid email/password combination.", flush=True)
        return 1

    if mode == "fail":
        print("ERROR    something went wrong", file=sys.stderr, flush=True)
        return 2

    if mode == "filter_demo":
        return _run_filter_demo()

    for i in range(1, total + 1):
        print(f"INFO     Downloading {i} of {total}", flush=True)
        time.sleep(sleep)
        if mode == "slow":
            time.sleep(0.5)

    print("INFO     done", flush=True)
    return 0


def _write_minimal_jpeg_with_exif(path: str, make: str, model: str) -> None:
    """Write a minimal JPEG with Make and Model EXIF tags using Pillow."""
    from PIL import Image

    img = Image.new("RGB", (1, 1), color=(128, 128, 128))
    exif = img.getexif()
    # EXIF tag IDs: Make=271, Model=272
    exif[271] = make
    exif[272] = model
    img.save(path, format="JPEG", exif=exif.tobytes())


def _write_minimal_heic(path: str, make: str, model: str) -> None:
    """Write a real HEIC file with Make and Model EXIF tags via pillow-heif."""
    from PIL import Image
    from pillow_heif import register_heif_opener

    register_heif_opener()
    img = Image.new("RGB", (16, 16), color=(128, 128, 128))
    exif = img.getexif()
    # EXIF tag IDs: Make=271, Model=272
    exif[271] = make
    exif[272] = model
    img.save(path, format="HEIF", exif=exif.tobytes())


def _truncate_middle(s: str, n: int = 96) -> str:
    """Middle-truncate like real icloudpd does for Downloaded log lines."""
    if len(s) <= n:
        return s
    if n <= 3:
        return "..."[:n]
    n_2 = (n - 3) // 2
    n_1 = n - 3 - n_2
    return f"{s[:n_1]}...{s[-n_2:]}"


def _write_minimal_png(path: str) -> None:
    """Write a minimal 1x1 PNG file without EXIF data."""
    from PIL import Image

    img = Image.new("RGB", (1, 1), color=(64, 64, 64))
    img.save(path, format="PNG")


def _run_filter_demo() -> int:
    """Create test image files in FAKE_ICLOUDPD_DIR and print Downloaded lines.

    With FAKE_ICLOUDPD_NESTED=1, files land in date-style subfolders (like a
    real folder_structure pattern) instead of flat in the target directory.
    """
    target_dir = os.environ.get("FAKE_ICLOUDPD_DIR", "/tmp")
    nested = os.environ.get("FAKE_ICLOUDPD_NESTED") == "1"
    os.makedirs(target_dir, exist_ok=True)

    def _dest(subdir: str, name: str) -> str:
        return os.path.join(target_dir, subdir, name) if nested else os.path.join(target_dir, name)

    files = [
        (_dest("2026/07/23", "img_apple.heic"), "heic", "Apple", "iPhone 15 Pro"),
        (_dest("2026/07/24", "img_samsung.jpg"), "jpg", "Samsung", "Galaxy S24"),
        (_dest("2026/07/24", "other.png"), "png", None, None),
    ]

    for file_path, kind, make, model in files:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        if kind == "heic" and make and model:
            _write_minimal_heic(file_path, make, model)
        elif kind == "jpg" and make and model:
            _write_minimal_jpeg_with_exif(file_path, make, model)
        else:
            _write_minimal_png(file_path)
        print(f"INFO     Downloaded {_truncate_middle(file_path)}", flush=True)

    print("INFO     done", flush=True)
    return 0


# Keep struct import for potential future use
_ = struct


if __name__ == "__main__":
    sys.exit(main())
