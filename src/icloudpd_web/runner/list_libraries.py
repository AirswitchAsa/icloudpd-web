"""Parse icloudpd --list-libraries output.

icloudpd prints library names one per line to stdout via
    print(*library_names, sep="\\n")

The same captured log also contains auth/logging noise (INFO lines,
getpass warnings, 2FA prompts). Library names are bare identifiers
without spaces or log prefixes (e.g. 'PrimarySync',
'SharedSync-ABCDE-1234...').
"""

from __future__ import annotations

import re


# A library identifier is a non-whitespace token with no colons/slashes.
# Everything logged by icloudpd (INFO, ERROR, date-prefixed lines, prompts)
# contains at least one space or colon, so we filter those out.
_LIBRARY_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]*$")


def parse_library_names(log_text: str) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for raw in log_text.splitlines():
        line = raw.strip()
        if not line or line in seen:
            continue
        if not _LIBRARY_NAME_RE.match(line):
            continue
        # Guard against matching log level tokens that might appear bare.
        if line.upper() in {"INFO", "ERROR", "WARNING", "DEBUG", "CRITICAL"}:
            continue
        names.append(line)
        seen.add(line)
    return names
