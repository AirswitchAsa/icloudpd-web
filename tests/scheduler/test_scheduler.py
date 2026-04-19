from datetime import datetime
from pathlib import Path

import pytest  # noqa: F401

from icloudpd_web.scheduler.scheduler import Scheduler
from icloudpd_web.store.models import NotificationConfig, Policy


class FakeStore:
    def __init__(self, policies: list[Policy]) -> None:
        self._policies = policies

    def all(self) -> list[Policy]:
        return list(self._policies)


class FakeRunner:
    def __init__(self) -> None:
        self.running: set[str] = set()
        self.fired: list[tuple[str, datetime]] = []

    def is_running(self, name: str) -> bool:
        return name in self.running

    async def start(self, policy: Policy, *, password: str | None = None, trigger: str) -> object:
        self.fired.append((policy.name, datetime.now()))
        return object()


def _p(name: str, cron: str, enabled: bool = True, tz: str | None = None) -> Policy:
    return Policy(
        name=name,
        username="u@icloud.com",
        directory=Path("/tmp/p"),
        cron=cron,
        enabled=enabled,
        timezone=tz,
        icloudpd={},
        notifications=NotificationConfig(),
        aws=None,
    )


def _passwords(_name: str) -> None:
    return None


def test_fires_when_cron_matches() -> None:
    store = FakeStore([_p("a", "* * * * *")])
    runner = FakeRunner()
    s = Scheduler(store=store, runner=runner, password_lookup=_passwords)
    now = datetime(2026, 1, 1, 12, 30, 15)
    s.tick(now)
    assert [p.name for p in s._pending] == ["a"]


def test_dedupes_within_minute() -> None:
    store = FakeStore([_p("a", "* * * * *")])
    runner = FakeRunner()
    s = Scheduler(store=store, runner=runner, password_lookup=_passwords)
    t0 = datetime(2026, 1, 1, 12, 30, 15)
    t1 = datetime(2026, 1, 1, 12, 30, 45)
    s.tick(t0)
    s.tick(t1)
    assert len(s._pending) == 1


def test_skips_overlap() -> None:
    store = FakeStore([_p("a", "* * * * *")])
    runner = FakeRunner()
    runner.running.add("a")
    s = Scheduler(store=store, runner=runner, password_lookup=_passwords)
    s.tick(datetime(2026, 1, 1, 12, 30, 15))
    assert s._pending == []


def test_skips_disabled() -> None:
    store = FakeStore([_p("a", "* * * * *", enabled=False)])
    runner = FakeRunner()
    s = Scheduler(store=store, runner=runner, password_lookup=_passwords)
    s.tick(datetime(2026, 1, 1, 12, 30, 15))
    assert s._pending == []


def test_next_run_at() -> None:
    s = Scheduler(store=FakeStore([]), runner=FakeRunner(), password_lookup=_passwords)
    p = _p("a", "0 * * * *")
    dt = s.next_run_at(p, after=datetime(2026, 1, 1, 12, 30))
    assert dt == datetime(2026, 1, 1, 13, 0)
