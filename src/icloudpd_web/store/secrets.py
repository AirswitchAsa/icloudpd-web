from __future__ import annotations

import os
from pathlib import Path


class SecretStore:
    def __init__(self, dir: Path) -> None:
        self._dir = dir
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, name: str) -> Path:
        return self._dir / f"{name}.password"

    def set(self, name: str, value: str) -> None:
        path = self._path(name)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, value.encode("utf-8"))
        finally:
            os.close(fd)
        os.chmod(path, 0o600)

    def get(self, name: str) -> str | None:
        path = self._path(name)
        if not path.is_file():
            return None
        return path.read_text(encoding="utf-8")

    def delete(self, name: str) -> None:
        path = self._path(name)
        if path.exists():
            path.unlink()
