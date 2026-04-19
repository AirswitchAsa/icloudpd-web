from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from icloudpd_web.store.models import AwsConfig, NotificationConfig, Policy


def _valid_kwargs(**overrides: object) -> dict[str, Any]:
    base: dict[str, Any] = {
        "name": "family-photos",
        "username": "user@icloud.com",
        "directory": Path("/tmp/out"),
        "cron": "0 */6 * * *",
        "enabled": True,
        "timezone": None,
        "icloudpd": {"album": "All Photos"},
        "notifications": NotificationConfig(),
        "aws": None,
    }
    base.update(overrides)
    return base


def test_policy_valid() -> None:
    p = Policy(**_valid_kwargs())
    assert p.name == "family-photos"
    assert p.next_run_at is None
    assert p.last_run is None


def test_policy_name_must_be_slug() -> None:
    with pytest.raises(ValidationError):
        Policy(**_valid_kwargs(name="not a slug!"))


def test_policy_rejects_invalid_cron() -> None:
    with pytest.raises(ValidationError):
        Policy(**_valid_kwargs(cron="not a cron"))


def test_policy_rejects_bad_timezone() -> None:
    with pytest.raises(ValidationError):
        Policy(**_valid_kwargs(timezone="Nowhere/Nope"))


def test_notification_defaults() -> None:
    n = NotificationConfig()
    assert n.on_start is False
    assert n.on_success is True
    assert n.on_failure is True


def test_aws_requires_bucket_when_enabled() -> None:
    with pytest.raises(ValidationError):
        AwsConfig(enabled=True, bucket=None, prefix="", region="us-east-1")
