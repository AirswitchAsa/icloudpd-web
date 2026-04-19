from __future__ import annotations

import os
from pathlib import Path

import tomllib
from pydantic import BaseModel, Field

from icloudpd_web.store.policy_store import _dump_toml


class AppriseSettings(BaseModel):
    urls: list[str] = Field(default_factory=list)
    on_start: bool = False
    on_success: bool = True
    on_failure: bool = True


class ServerSettings(BaseModel):
    apprise: AppriseSettings = Field(default_factory=AppriseSettings)
    retention_runs: int = 10


class SettingsStore:
    def __init__(self, path: Path) -> None:
        self._path = path

    def load(self) -> ServerSettings:
        if not self._path.exists():
            return ServerSettings()
        data = tomllib.loads(self._path.read_text(encoding="utf-8"))
        return ServerSettings(**data)

    def save(self, settings: ServerSettings) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(self._path.suffix + ".tmp")
        payload = _dump_toml(settings.model_dump(mode="json"))
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
        try:
            os.write(fd, payload)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(tmp, self._path)
