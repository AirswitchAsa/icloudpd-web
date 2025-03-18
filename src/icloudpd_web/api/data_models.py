from collections.abc import Sequence
from enum import Enum
from typing import Annotated, Literal

from croniter import croniter
from pydantic import BaseModel, Field, field_validator


NON_POLICY_FIELDS = ["status", "progress", "authenticated", "albums", "waiting_mfa", "scheduled"]
IGNORED_FIELDS = [
    "live_photo_size",
    "live_photo_mov_filename_policy",
    "align_raw",
    "force_size",
    "keep_unicode_in_filenames",
    "set_exif_datetime",
    "xmp_sidecar",
    "use_os_locale",
    "file_match_policy",
]


class AuthenticationResult(Enum):
    SUCCESS = "success"
    FAILED = "failed"
    MFA_REQUIRED = "mfa_required"


class PolicyConfigs(BaseModel):
    # Connection options
    username: str = Field(min_length=1)
    domain: Literal["com", "cn"] = "com"

    # Download options
    directory: str = Field(min_length=1)
    download_via_browser: bool = False
    folder_structure: str = "{:%Y/%m/%d}"
    size: Sequence[Literal["original", "medium", "thumb", "adjusted", "alternative"]] = ["original"]
    live_photo_size: Literal["original", "medium", "thumb"] = "original"
    force_size: bool = False
    align_raw: Literal["original", "alternative", "as-is"] = "as-is"
    keep_unicode_in_filenames: bool = False
    set_exif_datetime: bool = False
    live_photo_mov_filename_policy: Literal["original", "suffix"] = "suffix"
    file_match_policy: Literal["name-size-dedup-with-suffix", "name-id7"] = (
        "name-size-dedup-with-suffix"
    )
    xmp_sidecar: bool = False
    use_os_locale: bool = False

    # Filter options
    album: str = "All Photos"
    library: Literal["Personal Library", "Shared Library"] = "Personal Library"
    recent: Annotated[int, Field(ge=0)] | None = None
    until_found: Annotated[int, Field(ge=0)] | None = None
    skip_videos: bool = False
    skip_live_photos: bool = False
    file_suffixes: list[str] | None = []
    device_make: list[str] | None = []
    device_model: list[str] | None = []
    match_pattern: str | None = None
    created_after: str | None = None
    created_before: str | None = None
    added_after: str | None = None
    added_before: str | None = None

    # Delete options
    auto_delete: bool = False
    keep_icloud_recent_days: Annotated[int, Field(ge=0)] | None = None

    # icloudpd-ui options
    dry_run: bool = False
    interval: str | None = None
    log_level: Literal["debug", "info", "error"] = "info"

    # Integration options
    remove_local_copy: bool = False
    upload_to_aws_s3: bool = False

    @field_validator("interval")
    def validate_cron_expression(cls, v: str | None) -> str | None:  # noqa: N805 ANN101
        if v == "":
            return None
        if v is not None:
            if not croniter.is_valid(v):
                raise ValueError(
                    "Invalid cron expression. Must be in format: '* * * * *' "
                    "(minute hour day_of_month month day_of_week)"
                )
        return v
