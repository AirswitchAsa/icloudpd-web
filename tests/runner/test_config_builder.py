from pathlib import Path

from icloudpd_web.runner.config_builder import build_config
from icloudpd_web.store.models import NotificationConfig, Policy


def _p() -> Policy:
    return Policy(
        name="p",
        username="u@icloud.com",
        directory=Path("/data/p"),
        cron="0 * * * *",
        enabled=True,
        icloudpd={"album": "All Photos", "size": ["original"]},
        notifications=NotificationConfig(),
        aws=None,
    )


def test_build_config_has_username_and_directory() -> None:
    cfg = build_config(_p(), password="pw")
    assert "username" in cfg
    assert cfg["username"] == "u@icloud.com"
    assert cfg["directory"] == "/data/p"


def test_build_config_passthrough() -> None:
    cfg = build_config(_p(), password="pw")
    assert cfg["album"] == "All Photos"
    assert cfg["size"] == ["original"]


def test_build_config_does_not_include_our_meta() -> None:
    cfg = build_config(_p(), password="pw")
    for key in ("cron", "enabled", "notifications", "aws", "timezone", "icloudpd"):
        assert key not in cfg


def test_build_config_includes_password_when_provided() -> None:
    cfg = build_config(_p(), password="pw")
    assert cfg["password"] == "pw"


def test_build_config_omits_password_when_none() -> None:
    cfg = build_config(_p(), password=None)
    assert "password" not in cfg
