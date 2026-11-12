from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from icloudpd_web.runner.runner import Runner
from icloudpd_web.store.models import Policy


FAKE = Path(__file__).resolve().parent.parent / "fixtures" / "fake_icloudpd.py"


@pytest.mark.asyncio
@pytest.mark.parametrize("domain", ["cn", "com", None])
async def test_shared_run_preserves_domain(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, domain: str | None
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_SHARED_LIB", "SharedSync-XYZ")
    commands: list[list[str]] = []

    def capture_argv(tail: list[str]) -> list[str]:
        commands.append(tail)
        return _fake_argv(tail)

    policy = _policy().model_copy(
        update={
            "directory": tmp_path / "photos",
            "library_kind": "shared",
            "icloudpd": {"domain": domain} if domain is not None else {},
        }
    )
    runner = Runner(runs_base=tmp_path / "runs", icloudpd_argv=capture_argv)
    run = await runner.start(policy, password="pw", trigger="manual")
    await run.wait()

    assert run.status == "success"
    assert len(commands) == 2
    discovery, download = commands
    assert "--list-libraries" in discovery
    assert download[download.index("--library") + 1] == "SharedSync-XYZ"
    for command in commands:
        if domain is None:
            assert "--domain" not in command
        else:
            assert command.count("--domain") == 1
            assert command[command.index("--domain") + 1] == domain


@pytest.mark.asyncio
async def test_discovery_wrong_domain_has_actionable_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "wrong_domain")
    runner = Runner(runs_base=tmp_path, icloudpd_argv=_fake_argv)
    with pytest.raises(RuntimeError, match="set Domain to cn"):
        await runner.discover_libraries(_policy(), password="pw", timeout=10.0)

    [sidecar] = (tmp_path / "p").glob("*.meta.json")
    meta = json.loads(sidecar.read_text())
    assert meta["status"] == "failed"
    assert meta["failure_reason"] == "wrong_domain"
    assert meta["error_id"] == meta["run_id"]


def _fake_argv(argv_tail: list[str]) -> list[str]:
    return [sys.executable, str(FAKE), *argv_tail]


def _policy() -> Policy:
    return Policy(
        name="p",
        username="u@icloud.com",
        directory=Path("/tmp/p"),
        cron="0 * * * *",
        enabled=True,
    )


@pytest.mark.asyncio
async def test_discover_libraries_returns_names(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_SHARED_LIB", "SharedSync-ABCDE")
    runner = Runner(runs_base=tmp_path, icloudpd_argv=_fake_argv)
    names = await runner.discover_libraries(_policy(), password="pw", timeout=10.0)
    assert names == ["PrimarySync", "SharedSync-ABCDE"]


@pytest.mark.asyncio
async def test_discover_libraries_without_shared(tmp_path: Path) -> None:
    runner = Runner(runs_base=tmp_path, icloudpd_argv=_fake_argv)
    names = await runner.discover_libraries(_policy(), password="pw", timeout=10.0)
    assert names == ["PrimarySync"]


@pytest.mark.asyncio
async def test_discover_libraries_requires_password(tmp_path: Path) -> None:
    runner = Runner(runs_base=tmp_path, icloudpd_argv=_fake_argv)
    with pytest.raises(ValueError, match="password required"):
        await runner.discover_libraries(_policy(), password=None)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_discover_libraries_fails_on_nonzero_exit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "fail")
    # The fail mode doesn't honor --list-libraries; it exits 2 before reaching that code path.
    # But --list-libraries short-circuits first, so force the fail path by unsetting the fake's
    # list_libraries short-circuit via a different approach: use a non-existent executable.
    bad_runner = Runner(
        runs_base=tmp_path,
        icloudpd_argv=lambda _tail: [sys.executable, "-c", "import sys; sys.exit(5)"],
    )
    with pytest.raises(RuntimeError, match="discovery failed"):
        await bad_runner.discover_libraries(_policy(), password="pw", timeout=10.0)


@pytest.mark.asyncio
async def test_resolve_library_kind_personal_is_sync(tmp_path: Path) -> None:
    runner = Runner(runs_base=tmp_path, icloudpd_argv=_fake_argv)
    p = _policy().model_copy(update={"library_kind": "personal"})
    assert await runner._resolve_library_kind(p, "pw") == "PrimarySync"


@pytest.mark.asyncio
async def test_resolve_library_kind_shared_caches(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_SHARED_LIB", "SharedSync-XYZ")
    runner = Runner(runs_base=tmp_path, icloudpd_argv=_fake_argv)
    p = _policy().model_copy(update={"library_kind": "shared"})
    first = await runner._resolve_library_kind(p, "pw")
    assert first == "SharedSync-XYZ"
    # Second call must hit the cache (we assert by clearing the env var — if
    # the cache didn't work, the subprocess would only return PrimarySync).
    monkeypatch.delenv("FAKE_ICLOUDPD_SHARED_LIB")
    assert await runner._resolve_library_kind(p, "pw") == "SharedSync-XYZ"


@pytest.mark.asyncio
async def test_resolve_library_kind_shared_no_shared_library(tmp_path: Path) -> None:
    runner = Runner(runs_base=tmp_path, icloudpd_argv=_fake_argv)
    p = _policy().model_copy(update={"library_kind": "shared"})
    with pytest.raises(RuntimeError, match="No shared library"):
        await runner._resolve_library_kind(p, "pw")


@pytest.mark.asyncio
async def test_resolve_library_kind_none_returns_none(tmp_path: Path) -> None:
    runner = Runner(runs_base=tmp_path, icloudpd_argv=_fake_argv)
    assert await runner._resolve_library_kind(_policy(), "pw") is None
