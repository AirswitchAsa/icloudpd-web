from pydantic import BaseModel, Field
from typing import Literal, Annotated
from enum import Enum

NON_POLICY_FIELDS = ["status", "progress", "authenticated"]


class AuthenticationResult(Enum):
    SUCCESS = "success"
    FAILED = "failed"
    MFA_REQUIRED = "mfa_required"


class PolicyConfigs(BaseModel):
    # Connection options
    username: str
    domain: Literal["com", "cn"] = "com"

    # Download options
    directory: str
    folder_structure: str | None = None
    size: Literal["original", "medium", "thumb", "adjusted", "alternative"] = "original"
    live_photo_size: Literal["original", "medium", "thumb"] = "original"
    force_size: bool = False
    align_raw: Literal["as-original", "as-alternative", "as-is"] = "as-original"
    keep_unicode_in_filenames: bool = False
    set_exif_datetime: bool = False
    live_photo_mov_filename_policy: Literal["original", "suffix"] = "suffix"
    xmp_sidecar: bool = False
    use_os_locale: bool = False

    # Filter options
    album: str | None = None
    library: Literal["Personal Library", "Shared Library", "Both"] = "Personal Library"
    recent: Annotated[int, Field(ge=0)] | None = None
    until_found: Annotated[int, Field(ge=0)] | None = None
    file_match_policy: Literal["name-size-dedup-with-suffix", "name-id7"] = (
        "name-size-dedup-with-suffix"
    )
    skip_videos: bool = False
    skip_live_photos: bool = False

    # Delete options
    auto_delete: bool = False
    delete_after_download: bool = False

    # icloudpd-ui options
    interval: Annotated[int, Field(ge=0)] | None = None