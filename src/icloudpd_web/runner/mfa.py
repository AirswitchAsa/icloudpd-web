from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class MfaSlot:
    policy_name: str
    path: Path


class MfaRegistry:
    def __init__(self, base: Path) -> None:
        self._base = base
        self._base.mkdir(parents=True, exist_ok=True)
        self._slots: dict[str, MfaSlot] = {}

    def register(self, policy_name: str) -> MfaSlot:
        path = self._base / f"{policy_name}.code"
        if path.exists():
            path.unlink()
        slot = MfaSlot(policy_name=policy_name, path=path)
        self._slots[policy_name] = slot
        return slot

    def awaiting(self, policy_name: str) -> bool:
        slot = self._slots.get(policy_name)
        return slot is not None and not slot.path.exists()

    def provide(self, policy_name: str, code: str) -> None:
        slot = self._slots.get(policy_name)
        if slot is None:
            raise KeyError(policy_name)
        fd = os.open(slot.path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, code.encode("utf-8") + b"\n")
        finally:
            os.close(fd)

    def cleanup(self, policy_name: str) -> None:
        slot = self._slots.pop(policy_name, None)
        if slot and slot.path.exists():
            slot.path.unlink()
