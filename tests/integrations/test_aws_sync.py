import sys
from pathlib import Path

import pytest

from icloudpd_web.integrations.aws_sync import AwsSync
from icloudpd_web.store.models import AwsConfig


@pytest.mark.asyncio
async def test_disabled_noop(tmp_path: Path) -> None:
    s = AwsSync(argv_fn=lambda src, dst: ["true"])
    out = await s.run(AwsConfig(enabled=False), source=tmp_path)
    assert out.skipped is True


@pytest.mark.asyncio
async def test_command_success(tmp_path: Path) -> None:
    s = AwsSync(argv_fn=lambda src, dst: [sys.executable, "-c", "print('ok')"])
    cfg = AwsConfig(enabled=True, bucket="b", prefix="x", region="us-east-1")
    out = await s.run(cfg, source=tmp_path)
    assert out.skipped is False
    assert out.exit_code == 0
    assert "ok" in out.output


@pytest.mark.asyncio
async def test_command_failure_does_not_raise(tmp_path: Path) -> None:
    s = AwsSync(argv_fn=lambda src, dst: [sys.executable, "-c", "import sys; sys.exit(3)"])
    cfg = AwsConfig(enabled=True, bucket="b", prefix="x", region="us-east-1")
    out = await s.run(cfg, source=tmp_path)
    assert out.exit_code == 3
