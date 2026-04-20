from __future__ import annotations

import contextlib
import logging
import os
import threading
from pathlib import Path
from typing import Any

import tomli_w
import tomllib

from .models import Policy


log = logging.getLogger(__name__)


class PolicyStore:
    def __init__(self, dir: Path) -> None:
        self._dir = dir
        self._dir.mkdir(parents=True, exist_ok=True)
        self._policies: dict[str, Policy] = {}
        self._generation = 0
        self._lock = threading.Lock()

    @property
    def generation(self) -> int:
        return self._generation

    def load(self) -> None:
        with self._lock:
            self._policies.clear()
            for path in sorted(self._dir.glob("*.toml")):
                try:
                    data = tomllib.loads(path.read_text(encoding="utf-8"))
                    p = self._from_toml(data)
                    self._policies[p.name] = p
                except Exception as e:
                    log.warning("skipping invalid policy file %s: %s", path.name, e)

    def all(self) -> list[Policy]:
        with self._lock:
            return list(self._policies.values())

    def get(self, name: str) -> Policy | None:
        with self._lock:
            return self._policies.get(name)

    def put(self, policy: Policy) -> None:
        payload = tomli_w.dumps(policy.to_toml_dict()).encode("utf-8")
        with self._lock:
            path = self._dir / f"{policy.name}.toml"
            tmp = path.with_suffix(".toml.tmp")
            try:
                fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
                try:
                    os.write(fd, payload)
                    os.fsync(fd)
                finally:
                    os.close(fd)
                os.replace(tmp, path)
            except Exception:
                with contextlib.suppress(OSError):
                    tmp.unlink()
                raise
            self._policies[policy.name] = policy
            self._generation += 1

    def delete(self, name: str) -> bool:
        with self._lock:
            if name not in self._policies:
                return False
            path = self._dir / f"{name}.toml"
            if path.exists():
                path.unlink()
            del self._policies[name]
            self._generation += 1
            return True

    def bump(self) -> int:
        """Bump generation without policy change (e.g. run state transition)."""
        with self._lock:
            self._generation += 1
            return self._generation

    @staticmethod
    def _from_toml(data: dict[str, Any]) -> Policy:
        # Let Pydantic handle field population (including defaults, nested
        # AwsConfig/Filters, and future fields) rather than listing fields
        # here. Runtime-only fields like `next_run_at` / `last_run` are not
        # in the TOML so they default to None.
        return Policy.model_validate(data)
