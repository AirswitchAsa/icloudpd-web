from __future__ import annotations

import asyncio
import logging
import zoneinfo
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Protocol

from croniter import croniter

from icloudpd_web.store.models import Policy


log = logging.getLogger(__name__)


class _StoreProto(Protocol):
    def all(self) -> list[Policy]: ...  # pragma: no cover


class _RunnerProto(Protocol):
    def is_running(self, name: str) -> bool: ...  # pragma: no cover

    async def start(
        self, policy: Policy, *, password: str | None, trigger: str
    ) -> object: ...  # pragma: no cover


class Scheduler:
    def __init__(
        self,
        *,
        store: _StoreProto,
        runner: _RunnerProto,
        password_lookup: Callable[[str], str | None],
    ) -> None:
        self._store = store
        self._runner = runner
        self._password_lookup = password_lookup
        self._last_fired: dict[str, datetime] = {}
        self._stop = asyncio.Event()
        self._pending: list[Policy] = []

    def next_run_at(self, policy: Policy, *, after: datetime) -> datetime:
        return croniter(policy.cron, after).get_next(datetime)

    def tick(self, now: datetime) -> None:
        for p in self._store.all():
            if not p.enabled:
                continue
            if self._runner.is_running(p.name):
                continue
            local_now = self._localize(now, p)
            minute = local_now.replace(second=0, microsecond=0)
            if not croniter.match(p.cron, minute):
                continue
            if self._last_fired.get(p.name) == minute:
                continue
            self._last_fired[p.name] = minute
            self._pending.append(p)

    async def run_forever(self) -> None:
        while not self._stop.is_set():
            await asyncio.sleep(1)
            try:
                self.tick(datetime.now(timezone.utc))
                await self._drain_pending()
            except Exception:
                log.exception("scheduler tick failed")

    def stop(self) -> None:
        self._stop.set()

    async def _drain_pending(self) -> None:
        while self._pending:
            p = self._pending.pop(0)
            try:
                await self._runner.start(
                    p,
                    password=self._password_lookup(p.name),
                    trigger="cron",
                )
            except Exception:
                log.exception("failed to start scheduled policy %s", p.name)

    @staticmethod
    def _localize(now: datetime, policy: Policy) -> datetime:
        if policy.timezone is None:
            return now  # preserve naive/aware as-is
        tz = zoneinfo.ZoneInfo(policy.timezone)
        if now.tzinfo is None:
            # Treat naive as UTC for localization consistency.
            return now.replace(tzinfo=timezone.utc).astimezone(tz)
        return now.astimezone(tz)
