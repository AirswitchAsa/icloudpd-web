import asyncio
from pathlib import Path

import pytest

from icloudpd_web.runner.runner import Runner
from icloudpd_web.store.models import Policy


def _policy() -> Policy:
    return Policy(
        name="p",
        username="u@icloud.com",
        directory=Path("/tmp/p"),
        cron="0 * * * *",
        enabled=True,
        icloudpd={},
        aws=None,
    )


@pytest.mark.asyncio
async def test_start_returns_run(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "2")

    r = Runner(
        runs_base=tmp_path,
        icloudpd_argv=lambda argv_tail: [*fake_icloudpd_cmd, *argv_tail],
    )
    run = await r.start(_policy(), password="pw", trigger="manual")
    await run.wait()
    assert run.status == "success"
    assert r.is_running("p") is False


@pytest.mark.asyncio
async def test_is_running_blocks_duplicate(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "slow")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "100")

    r = Runner(
        runs_base=tmp_path,
        icloudpd_argv=lambda argv_tail: [*fake_icloudpd_cmd, *argv_tail],
    )
    run = await r.start(_policy(), password="pw", trigger="manual")
    assert r.is_running("p") is True
    with pytest.raises(RuntimeError):
        await r.start(_policy(), password="pw", trigger="manual")
    await run.stop()
    await run.wait()


@pytest.mark.asyncio
async def test_prunes_logs_after_completion(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")

    r = Runner(
        runs_base=tmp_path,
        icloudpd_argv=lambda argv_tail: [*fake_icloudpd_cmd, *argv_tail],
        retention=2,
    )
    for _ in range(4):
        run = await r.start(_policy(), password="pw", trigger="manual")
        await run.wait()
        # Brief pause so file mtimes differ.
        await asyncio.sleep(0.01)
    # Wait for the post-completion prune task to finish.
    await asyncio.sleep(0.1)
    log_files = list((tmp_path / "p").glob("*.log"))
    assert len(log_files) == 2


@pytest.mark.asyncio
async def test_start_raises_without_password(tmp_path: Path, fake_icloudpd_cmd: list[str]) -> None:
    r = Runner(
        runs_base=tmp_path,
        icloudpd_argv=lambda argv_tail: [*fake_icloudpd_cmd, *argv_tail],
    )
    with pytest.raises(ValueError, match="password is required"):
        await r.start(_policy(), password=None, trigger="manual")
