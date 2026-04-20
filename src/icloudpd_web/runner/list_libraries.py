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


# icloudpd emits library identifiers as either "PrimarySync" (personal
# library) or "SharedSync-<hash>" (shared library). We match those
# specific shapes rather than any bare token, so spurious log words
# like `Authenticated` can never pollute the result.
_LIBRARY_NAME_RE = re.compile(r"^(?:PrimarySync|SharedSync-[A-Za-z0-9_\-]+)$")


def parse_library_names(log_text: str) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for raw in log_text.splitlines():
        line = raw.strip()
        if not line or line in seen:
            continue
        if not _LIBRARY_NAME_RE.match(line):
            continue
        names.append(line)
        seen.add(line)
    return names
