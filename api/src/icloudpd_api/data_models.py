from pydantic import BaseModel, Field
from typing import Sequence, Literal, Annotated
from enum import Enum

NON_POLICY_FIELDS = ["status", "progress", "authenticated", "albums"]


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
    folder_structure: str = "{:%Y/%m/%d}"
    size: Sequence[Literal["original", "medium", "thumb", "adjusted", "alternative"]] = ["original"]
    live_photo_size: Literal["original", "medium", "thumb"] = "original"
    force_size: bool = False
    align_raw: Literal["original", "alternative", "as-is"] = "original"
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

    # Delete options
    auto_delete: bool = False
    delete_after_download: bool = False

    # icloudpd-ui options
    interval: Annotated[int, Field(ge=0)] | None = None
    log_level: Literal["debug", "info", "error"] = "info"
