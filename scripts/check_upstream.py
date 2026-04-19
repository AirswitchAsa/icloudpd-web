"""Pre-release upstream-compatibility smoke test.

Runs the installed `icloudpd --version` and `icloudpd --help` and asserts every
long flag we emit via `config_builder.build_argv` still appears in `--help`.

Never runs in CI — it shells out to the real icloudpd binary, which is what we
deliberately avoid in the test suite. Run it manually before bumping the pin.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys


# Long flags we depend on — source of truth is runner/config_builder.py.
# Keep this aligned with that module when it changes.
# Note: --password is NOT in this list because the password is delivered via
# stdin (--password-provider console) and never appears in argv.
# --username, --directory, --mfa-provider, --password-provider are always
# emitted by build_argv.
REQUIRED_FLAGS = [
    "--username",
    "--directory",
    "--mfa-provider",
    "--password-provider",
    # These are common flags passed through from policy.icloudpd dict
    "--album",
    "--size",
    "--skip-videos",
    "--skip-live-photos",
    "--auth-only",
    "--recent",
    "--until-found",
    "--xmp-sidecar",
    "--auto-delete",
    "--folder-structure",
    "--set-exif-datetime",
    "--smtp-username",
    "--smtp-password",
    "--smtp-host",
    "--smtp-port",
    "--smtp-no-tls",
    "--notification-email",
    "--notification-email-from",
    "--notification-script",
    "--delete-after-download",
    "--keep-icloud-recent-days",
    "--dry-run",
    "--skip-photos",
    "--skip-created-before",
    "--skip-created-after",
    "--live-photo-size",
    "--cookie-directory",
    "--list-albums",
    "--library",
    "--list-libraries",
    "--force-size",
    "--keep-unicode-in-filenames",
    "--file-match-policy",
    "--live-photo-mov-filename-policy",
    "--align-raw",
    "--log-level",
    "--domain",
    "--no-progress-bar",
    "--only-print-filenames",
    "--use-os-locale",
    "--watch-with-interval",
    "--password-provider",
]


def main() -> int:
    bin_path = shutil.which("icloudpd")
    if not bin_path:
        print("icloudpd not found on PATH — install the pinned version first", file=sys.stderr)
        return 2

    version = subprocess.run([bin_path, "--version"], capture_output=True, text=True, timeout=30)
    help_out = subprocess.run([bin_path, "--help"], capture_output=True, text=True, timeout=30)

    print("icloudpd --version:", (version.stdout or version.stderr).strip())

    missing = [
        f for f in REQUIRED_FLAGS if not re.search(rf"(^|\s){re.escape(f)}\b", help_out.stdout)
    ]
    if missing:
        print("\nFLAGS MISSING from icloudpd --help:", file=sys.stderr)
        for f in missing:
            print(f"  {f}", file=sys.stderr)
        print(
            "\nUpstream has renamed or removed these. Update config_builder.py and this script.",
            file=sys.stderr,
        )
        return 1

    print(f"\nAll {len(REQUIRED_FLAGS)} flags still present. Safe to bump the pin.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
