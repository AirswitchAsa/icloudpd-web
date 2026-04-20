from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from icloudpd_web.store.models import AwsConfig, Policy


def _valid_kwargs(**overrides: object) -> dict[str, Any]:
    base: dict[str, Any] = {
        "name": "family-photos",
        "username": "user@icloud.com",
        "directory": Path("/tmp/out"),
        "cron": "0 */6 * * *",
        "enabled": True,
        "timezone": None,
        "icloudpd": {"album": "All Photos"},
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


def test_library_kind_migration_personal() -> None:
    """Legacy 'Personal Library' / 'PrimarySync' strings lift to library_kind."""
    p = Policy(**_valid_kwargs(icloudpd={"library": "Personal Library"}))
    assert p.library_kind == "personal"
    assert "library" not in p.icloudpd

    p2 = Policy(**_valid_kwargs(icloudpd={"library": "PrimarySync"}))
    assert p2.library_kind == "personal"


def test_library_kind_migration_shared() -> None:
    p = Policy(**_valid_kwargs(icloudpd={"library": "Shared Library"}))
    assert p.library_kind == "shared"
    assert "library" not in p.icloudpd

    p2 = Policy(**_valid_kwargs(icloudpd={"library": "SharedSync-ABC-123"}))
    assert p2.library_kind == "shared"


def test_library_kind_explicit_overrides_icloudpd() -> None:
    """If library_kind is set, icloudpd.library is dropped unconditionally."""
    p = Policy(**_valid_kwargs(library_kind="personal", icloudpd={"library": "ignored"}))
    assert p.library_kind == "personal"
    assert "library" not in p.icloudpd


def test_policy_drops_literal_all_photos_album() -> None:
    """'All Photos' is our placeholder, not a real album — icloudpd would KeyError."""
    p = Policy(**_valid_kwargs(icloudpd={"album": "All Photos"}))
    assert "album" not in p.icloudpd

    p2 = Policy(**_valid_kwargs(icloudpd={"album": "  all photos  "}))
    assert "album" not in p2.icloudpd

    p3 = Policy(**_valid_kwargs(icloudpd={"album": ""}))
    assert "album" not in p3.icloudpd


def test_policy_keeps_real_album_name() -> None:
    p = Policy(**_valid_kwargs(icloudpd={"album": "Selfies"}))
    assert p.icloudpd["album"] == "Selfies"


def test_policy_strips_unknown_icloudpd_keys() -> None:
    """Stale fields left in [icloudpd] from removed UI options must not reach
    the subprocess. They get silently dropped on validation."""
    p = Policy(
        **_valid_kwargs(
            icloudpd={
                "album": "Selfies",
                "device_make": ["sigma", "leica"],  # removed, not a real flag
                "download_via_browser": False,  # removed, not a real flag
                "recent": 100,  # real flag, kept
            }
        )
    )
    assert p.icloudpd == {"album": "Selfies", "recent": 100}


def test_aws_requires_bucket_when_enabled() -> None:
    with pytest.raises(ValidationError):
        AwsConfig(enabled=True, bucket=None, prefix="", region="us-east-1")
