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


@pytest.mark.asyncio
async def test_injects_credentials_via_env(tmp_path: Path) -> None:
    """Access key / secret / region must reach the aws subprocess as env vars.

    We verify by having the subprocess print the env and capturing its output.
    """
    script = (
        "import os;"
        "print(os.environ.get('AWS_ACCESS_KEY_ID', ''));"
        "print(os.environ.get('AWS_SECRET_ACCESS_KEY', ''));"
        "print(os.environ.get('AWS_DEFAULT_REGION', ''))"
    )
    s = AwsSync(argv_fn=lambda src, dst: [sys.executable, "-c", script])
    cfg = AwsConfig(
        enabled=True,
        bucket="b",
        prefix="x",
        region="us-west-2",
        access_key_id="AKIA_TEST",
        secret_access_key="SECRET_TEST",
    )
    out = await s.run(cfg, source=tmp_path)
    assert out.exit_code == 0
    lines = out.output.strip().splitlines()
    assert lines == ["AKIA_TEST", "SECRET_TEST", "us-west-2"]


@pytest.mark.asyncio
async def test_omits_env_vars_when_creds_unset(tmp_path: Path) -> None:
    """When creds aren't configured, don't clobber ambient env.

    If a user relies on IAM role or ~/.aws/credentials, we must not inject
    empty-string env vars that would override them.
    """
    script = (
        "import os;"
        "print(repr(os.environ.get('AWS_ACCESS_KEY_ID')));"
        "print(repr(os.environ.get('AWS_SECRET_ACCESS_KEY')))"
    )
    s = AwsSync(argv_fn=lambda src, dst: [sys.executable, "-c", script])
    cfg = AwsConfig(enabled=True, bucket="b")
    out = await s.run(cfg, source=tmp_path)
    assert out.exit_code == 0
    # Neither env var should be set by our code when config doesn't provide
    # them. (They might be set in the ambient environment, so we only
    # assert they weren't injected as empty strings.)
    for line in out.output.strip().splitlines():
        assert line != "''", "AwsSync injected an empty credential env var"
