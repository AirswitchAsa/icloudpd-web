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
#
# Lines in our log files are prefixed with "YYYY-MM-DD HH:MM:SS " by
# Run._emit_log (for consistency across our own and icloudpd's output),
# so we accept an optional leading timestamp before the identifier.
_LIBRARY_NAME_RE = re.compile(
    r"^(?:\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+)?"
    r"(PrimarySync|SharedSync-[A-Za-z0-9_\-]+)$"
)


def parse_library_names(log_text: str) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for raw in log_text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = _LIBRARY_NAME_RE.match(line)
        if not m:
            continue
        name = m.group(1)
        if name in seen:
            continue
        names.append(name)
        seen.add(name)
    return names
