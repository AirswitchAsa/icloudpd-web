"""Tests that Run writes a .meta.json sidecar after completion."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from icloudpd_web.runner.run import Run


def _argv(fake_icloudpd_cmd: list[str]) -> list[str]:
    """Minimal valid argv for the fake binary (satisfies argparse requirements)."""
    return [
        *fake_icloudpd_cmd,
        "--username",
        "u@icloud.com",
        "--directory",
        "/tmp/test",
        "--password-provider",
        "console",
    ]


@pytest.mark.asyncio
async def test_sidecar_written_on_success(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "3")

    run = Run(
        run_id="policy-sid1",
        policy_name="policy",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
    )
    await run.start()
    await run.wait()

    meta_path = tmp_path / "policy-sid1.meta.json"
    assert meta_path.exists(), "sidecar .meta.json should be written after run completes"

    meta = json.loads(meta_path.read_text())
    assert meta["run_id"] == "policy-sid1"
    assert meta["policy_name"] == "policy"
    assert meta["status"] == "success"
    assert meta["started_at"] is not None
    assert meta["ended_at"] is not None
    assert meta["exit_code"] == 0


@pytest.mark.asyncio
async def test_sidecar_written_on_failure(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "fail")

    run = Run(
        run_id="policy-sid2",
        policy_name="policy",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
    )
    await run.start()
    await run.wait()

    meta_path = tmp_path / "policy-sid2.meta.json"
    assert meta_path.exists(), "sidecar .meta.json should be written after failed run"

    meta = json.loads(meta_path.read_text())
    assert meta["status"] == "failed"
    assert meta["exit_code"] == 2
    assert meta["error_id"] == "policy-sid2"


@pytest.mark.asyncio
async def test_sidecar_written_on_stop(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "slow")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "100")

    run = Run(
        run_id="policy-sid3",
        policy_name="policy",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
    )
    await run.start()
    await asyncio.sleep(0.3)
    await run.stop()
    await run.wait()

    meta_path = tmp_path / "policy-sid3.meta.json"
    assert meta_path.exists(), "sidecar .meta.json should be written after stopped run"

    meta = json.loads(meta_path.read_text())
    assert meta["status"] == "stopped"


@pytest.mark.asyncio
async def test_sidecar_has_progress_fields(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "5")

    run = Run(
        run_id="policy-sid4",
        policy_name="policy",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
    )
    await run.start()
    await run.wait()

    meta = json.loads((tmp_path / "policy-sid4.meta.json").read_text())
    assert meta["downloaded"] == 5
    assert meta["total"] == 5
