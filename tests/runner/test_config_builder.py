from pathlib import Path
from typing import Any

from icloudpd_web.runner.config_builder import build_argv, build_config
from icloudpd_web.store.models import Policy


def _p(icloudpd: dict[str, Any] | None = None) -> Policy:
    return Policy(
        name="p",
        username="u@icloud.com",
        directory=Path("/data/p"),
        cron="0 * * * *",
        enabled=True,
        icloudpd=icloudpd if icloudpd is not None else {"album": "Selfies", "size": ["original"]},
        aws=None,
    )


# ── build_config tests (kept for backward compat) ───────────────────────────


def test_build_config_has_username_and_directory() -> None:
    cfg = build_config(_p(), password="pw")
    assert "username" in cfg
    assert cfg["username"] == "u@icloud.com"
    assert cfg["directory"] == "/data/p"


def test_build_config_passthrough() -> None:
    cfg = build_config(_p(), password="pw")
    assert cfg["album"] == "Selfies"
    assert cfg["size"] == ["original"]


def test_build_config_does_not_include_our_meta() -> None:
    cfg = build_config(_p(), password="pw")
    for key in ("cron", "enabled", "aws", "timezone", "icloudpd"):
        assert key not in cfg


def test_build_config_includes_password_when_provided() -> None:
    cfg = build_config(_p(), password="pw")
    assert cfg["password"] == "pw"


def test_build_config_omits_password_when_none() -> None:
    cfg = build_config(_p(), password=None)
    assert "password" not in cfg


# ── build_argv tests ─────────────────────────────────────────────────────────


def test_build_argv_always_has_required_flags() -> None:
    argv = build_argv(_p())
    assert "--username" in argv
    assert "u@icloud.com" in argv
    assert "--directory" in argv
    assert "/data/p" in argv
    assert "--mfa-provider" in argv
    assert "--password-provider" in argv
    assert "console" in argv


def test_build_argv_no_password_in_argv() -> None:
    """Password must never appear in argv."""
    argv = build_argv(_p())
    assert "--password" not in argv
    # No value that looks like a password
    assert "pw" not in argv


def test_build_argv_list_value_repeated() -> None:
    argv = build_argv(_p())
    # size = ["original"] → --size original
    assert "--size" in argv
    idx = argv.index("--size")
    assert argv[idx + 1] == "original"


def test_build_argv_string_value() -> None:
    argv = build_argv(_p(icloudpd={"album": "Selfies"}))
    assert "--album" in argv
    idx = argv.index("--album")
    assert argv[idx + 1] == "Selfies"


def test_build_argv_bool_true_emits_flag() -> None:
    p = Policy(
        name="p",
        username="u@icloud.com",
        directory=Path("/data/p"),
        cron="0 * * * *",
        enabled=True,
        icloudpd={"skip_videos": True},
        aws=None,
    )
    argv = build_argv(p)
    assert "--skip-videos" in argv


def test_build_argv_bool_false_omits_flag() -> None:
    p = Policy(
        name="p",
        username="u@icloud.com",
        directory=Path("/data/p"),
        cron="0 * * * *",
        enabled=True,
        icloudpd={"skip_videos": False},
        aws=None,
    )
    argv = build_argv(p)
    assert "--skip-videos" not in argv


def test_build_argv_snake_case_to_kebab() -> None:
    p = Policy(
        name="p",
        username="u@icloud.com",
        directory=Path("/data/p"),
        cron="0 * * * *",
        enabled=True,
        icloudpd={"folder_structure": "{:%Y/%m/%d}"},
        aws=None,
    )
    argv = build_argv(p)
    assert "--folder-structure" in argv
    idx = argv.index("--folder-structure")
    assert argv[idx + 1] == "{:%Y/%m/%d}"


def test_build_argv_multi_size() -> None:
    p = Policy(
        name="p",
        username="u@icloud.com",
        directory=Path("/data/p"),
        cron="0 * * * *",
        enabled=True,
        icloudpd={"size": ["original", "medium"]},
        aws=None,
    )
    argv = build_argv(p)
    # Should produce --size original --size medium
    size_indices = [i for i, v in enumerate(argv) if v == "--size"]
    assert len(size_indices) == 2
    assert argv[size_indices[0] + 1] == "original"
    assert argv[size_indices[1] + 1] == "medium"
