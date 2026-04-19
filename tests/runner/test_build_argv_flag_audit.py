"""Flag-audit test: every CLI flag our wrapper emits must exist in real icloudpd --help.

When config_builder.build_argv starts emitting a flag that upstream icloudpd no
longer recognizes (or renames), this test fails at CI time with a clear pointer.

The REPRESENTATIVE_ICLOUDPD_CONFIG below mirrors the set of keys the frontend
can put into Policy.icloudpd. When the UI adds a new field, add it here too.
"""

from __future__ import annotations

import re
import shutil
import subprocess

import pytest

from icloudpd_web.runner.config_builder import build_argv
from icloudpd_web.store.models import Policy


# A value for every UI-exposed icloudpd field. Update when UI adds/removes fields.
REPRESENTATIVE_ICLOUDPD_CONFIG: dict[str, object] = {
    "domain": "com",
    "folder_structure": "{:%Y/%m/%d}",
    "size": ["original", "medium"],
    "live_photo_size": "original",
    "force_size": True,
    "align_raw": "original",
    "keep_unicode_in_filenames": True,
    "set_exif_datetime": True,
    "live_photo_mov_filename_policy": "suffix",
    "file_match_policy": "name-size-dedup-with-suffix",
    "xmp_sidecar": True,
    "use_os_locale": True,
    "album": "Favorites",
    "library": "PrimarySync",
    "recent": 10,
    "until_found": 5,
    "skip_videos": True,
    "skip_photos": True,
    "skip_live_photos": True,
    "auto_delete": True,
    "keep_icloud_recent_days": 30,
    "dry_run": True,
    "log_level": "info",
    # Phase 2 additions (may or may not be present yet):
    # "threads_num": 4,
    # "skip_created_before": "2020-01-01",
    # "skip_created_after": "2024-01-01",
}


_FLAG_RE = re.compile(r"(?:^|[\s,])(--[a-z0-9][a-z0-9-]*)")


@pytest.fixture(scope="session")
def real_icloudpd_flags() -> set[str]:
    bin_path = shutil.which("icloudpd")
    if not bin_path:
        pytest.skip("icloudpd not on PATH; cannot audit flags")
    result = subprocess.run([bin_path, "--help"], capture_output=True, text=True, timeout=30)
    return set(_FLAG_RE.findall(result.stdout))


def test_build_argv_emits_only_real_flags(real_icloudpd_flags: set[str]) -> None:
    policy = Policy(
        name="p",
        username="u@icloud.com",
        directory="/tmp/p",
        cron="0 * * * *",
        enabled=True,
        icloudpd=REPRESENTATIVE_ICLOUDPD_CONFIG,
    )
    argv = build_argv(policy)

    emitted = {a for a in argv if a.startswith("--")}
    invalid = emitted - real_icloudpd_flags
    assert not invalid, (
        f"build_argv emits flags that real icloudpd does not recognize: "
        f"{sorted(invalid)}. Either the UI field is a dead remnant, or "
        f"icloudpd has renamed/removed the flag upstream."
    )


def test_representative_config_is_comprehensive() -> None:
    """Drift tripwire: if defaultFormPolicy in web/src/lib/policyMapping.ts adds
    a new icloudpd-bound field, add it to REPRESENTATIVE_ICLOUDPD_CONFIG above.
    Detection heuristic: re-read policyMapping.ts and extract keys whose names
    are not in the non-icloudpd/new-backend-extras sets, then assert the set
    matches REPRESENTATIVE_ICLOUDPD_CONFIG's keys.
    """
    import re as _re
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "policyMapping.ts"
    src = path.read_text()

    def _block(name: str) -> set[str]:
        m = _re.search(rf"const {name} = new Set\(\[(.*?)\]\)", src, _re.DOTALL)
        assert m, f"{name} not found"
        return set(_re.findall(r'"([^"]+)"', m.group(1)))

    non_ic = _block("NON_ICLOUDPD_OLD_FIELDS")
    extras = _block("NEW_BACKEND_EXTRAS")

    default_block = _re.search(
        r"export function defaultFormPolicy\(\): FormPolicy \{.*?return \{(.*?)\};",
        src,
        _re.DOTALL,
    )
    assert default_block is not None
    keys = set(_re.findall(r"^\s*([a-z_]+):", default_block.group(1), _re.MULTILINE))

    ic_fields = keys - non_ic - extras
    expected = set(REPRESENTATIVE_ICLOUDPD_CONFIG.keys())
    missing = ic_fields - expected
    extra = expected - ic_fields
    assert not missing, (
        f"defaultFormPolicy has icloudpd-bound fields not in REPRESENTATIVE_ICLOUDPD_CONFIG: "
        f"{sorted(missing)}. Add them (with a representative value) to keep the audit tight."
    )
    assert not extra, (
        f"REPRESENTATIVE_ICLOUDPD_CONFIG has fields no longer in defaultFormPolicy: "
        f"{sorted(extra)}. Remove them from the test."
    )
