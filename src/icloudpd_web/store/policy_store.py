from __future__ import annotations

import contextlib
import io
import logging
import os
import threading
from pathlib import Path
from typing import Any

import tomllib

from .models import AwsConfig, NotificationConfig, Policy


log = logging.getLogger(__name__)

# Scalar types that _write_scalar handles
_Scalar = bool | int | float | str | list  # type: ignore[type-arg]


def _write_scalar(v: _Scalar) -> str:
    """Render a scalar (or list of scalars) to a TOML value string."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(v)
    if isinstance(v, str):
        esc = v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
        return f'"{esc}"'
    if isinstance(v, list):
        return "[" + ", ".join(_write_scalar(x) for x in v) + "]"
    raise TypeError(f"unsupported value for TOML: {type(v).__name__}")


def _write_table(buf: io.StringIO, header: str, tbl: dict[str, Any]) -> None:
    """Write a [header] table, then any nested sub-tables."""
    buf.write(f"\n[{header}]\n")
    for sk, sv in tbl.items():
        if not isinstance(sv, dict):
            buf.write(f"{sk} = {_write_scalar(sv)}\n")
    for sk, sv in tbl.items():
        if isinstance(sv, dict):
            buf.write(f"\n[{header}.{sk}]\n")
            for ssk, ssv in sv.items():
                buf.write(f"{ssk} = {_write_scalar(ssv)}\n")


def _dump_toml(data: dict[str, Any]) -> bytes:
    """Minimal TOML writer covering our schema (scalars, arrays, nested tables)."""
    buf = io.StringIO()
    # Top-level scalars first.
    for k, v in data.items():
        if not isinstance(v, dict):
            buf.write(f"{k} = {_write_scalar(v)}\n")
    # Then tables.
    for k, v in data.items():
        if isinstance(v, dict):
            _write_table(buf, k, v)
    return buf.getvalue().encode("utf-8")


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
        payload = _dump_toml(policy.to_toml_dict())
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
        return Policy(
            name=data["name"],
            username=data["username"],
            directory=Path(data["directory"]),
            cron=data["cron"],
            enabled=data.get("enabled", True),
            timezone=data.get("timezone"),
            icloudpd=data.get("icloudpd", {}),
            notifications=NotificationConfig(**data.get("notifications", {})),
            aws=AwsConfig(**data["aws"]) if "aws" in data else None,
        )
