"""Sentinel file protecting against folder-structure drift.

On the first successful run that writes into a directory, we drop a small
`.folderstructure` file containing the icloudpd `folder_structure` pattern
used. On every subsequent run start, we refuse to proceed if the stored
pattern differs from the policy's current one — otherwise the user would
end up with photos organized two different ways in the same tree and no
way to tell them apart.

Legacy directories (photos present but no sentinel) are allowed through;
we can't reconstruct the original pattern after the fact, so we just write
the sentinel on next success and carry on.
"""

from __future__ import annotations

from pathlib import Path


DEFAULT_PATTERN = "{:%Y/%m/%d}"
SENTINEL_NAME = ".folderstructure"


def _sentinel_path(directory: Path) -> Path:
    return directory / SENTINEL_NAME


def _effective(pattern: str | None) -> str:
    return pattern.strip() if pattern and pattern.strip() else DEFAULT_PATTERN


def check_or_raise(directory: Path, pattern: str | None) -> None:
    """Raise RuntimeError if the sentinel disagrees with the configured pattern."""
    p = _sentinel_path(directory)
    if not p.exists():
        return
    try:
        stored = p.read_text(encoding="utf-8").strip()
    except OSError:
        return  # unreadable sentinel; don't gate on it
    wanted = _effective(pattern)
    if stored != wanted:
        raise RuntimeError(
            f"Folder-structure mismatch for {directory}: previous runs used "
            f"{stored!r} but this policy is configured for {wanted!r}. "
            f"Either change the policy's folder_structure back, or remove "
            f"{p} if you want to restart with a different layout."
        )


def remember(directory: Path, pattern: str | None) -> None:
    """Write the sentinel on first success. No-op if it already exists."""
    p = _sentinel_path(directory)
    if p.exists():
        return
    try:
        directory.mkdir(parents=True, exist_ok=True)
        p.write_text(_effective(pattern), encoding="utf-8")
    except OSError:
        pass  # best-effort; readonly filesystems shouldn't break the run
