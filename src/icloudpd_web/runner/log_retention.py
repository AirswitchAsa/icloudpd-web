from __future__ import annotations

import contextlib
from pathlib import Path


def prune_logs(dir: Path, *, keep: int) -> int:
    if not dir.is_dir():
        return 0
    files = [p for p in dir.iterdir() if p.is_file() and p.suffix == ".log"]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    for p in files[keep:]:
        with contextlib.suppress(OSError):
            p.unlink()
        # Remove the matching sidecar, if it exists.
        sidecar = p.with_suffix(".meta.json")
        with contextlib.suppress(OSError):
            sidecar.unlink()
    return min(len(files), keep)
