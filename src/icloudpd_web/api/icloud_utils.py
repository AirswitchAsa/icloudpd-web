import os
from inspect import signature
from typing import Callable

from foundation.core import compose, identity
from icloudpd.base import download_builder, lp_filename_concatinator, lp_filename_original
from icloudpd.paths import clean_filename, remove_unicode_chars
from icloudpd_web.api.data_models import PolicyConfigs
from icloudpd_web.api.error import ICloudPdWebServerError
from icloudpd_web.api.logger import server_logger
from pyicloud_ipd.base import PyiCloudService
from pyicloud_ipd.file_match import FileMatchPolicy
from pyicloud_ipd.version_size import AssetVersionSize, LivePhotoVersionSize


class ICloudManager:
    @property
    def cookie_directory(self: "ICloudManager") -> str | None:
        return self._cookie_directory

    def __init__(self: "ICloudManager", cookie_directory: str | None) -> None:
        self._icloud_instances: dict[str, PyiCloudService] = {}
        self._cookie_directory: str | None = cookie_directory

    def get_instance(self: "ICloudManager", username: str) -> PyiCloudService | None:
        """
        Get the instance for the given username.
        """
        return self._icloud_instances.get(username)

    def set_instance(self: "ICloudManager", username: str, instance: PyiCloudService) -> None:
        """
        Set the instance for the given username.
        """
        if self._icloud_instances.get(username):
            raise ICloudPdWebServerError("Trying to set an icloud instance that already exists")
        else:
            self._icloud_instances[username] = instance

    def update_instance(self: "ICloudManager", username: str, attributes: dict) -> None:
        """
        Update the attributes of the instance with the given username.
        """
        instance = self._icloud_instances.get(username)
        if instance is None:
            raise ICloudPdWebServerError("Trying to update non-existing instance")
        for key in attributes:
            if not hasattr(instance, key):
                raise ICloudPdWebServerError(f"Instance does not have attribute '{key}'")
        for key, value in attributes.items():
            setattr(instance, key, value)

    def remove_instance(self: "ICloudManager", username: str) -> None:
        """
        Remove the instance for the given username.
        """
        self._icloud_instances.pop(username, None)

    def remove_instances(self: "ICloudManager", active_usernames: list[str]) -> None:
        """
        Remove all instances that are not in the list of active usernames.
        """
        for username in self._icloud_instances:
            if username not in active_usernames:
                self._icloud_instances.pop(username, None)


def request_2sa(icloud: PyiCloudService) -> None:
    """
    Request 2SA code using SMS from the first trusted device.
    Difference between 2FA and 2SA: https://discussions.apple.com/thread/7932277
    """
    devices = icloud.trusted_devices
    if len(devices) == 0:
        raise ValueError("No devices available for 2SA")
    # Request 2SA from the first trusteddevice
    phone_number = devices[0]["phoneNumber"]
    server_logger.info(f"Requesting 2SA code via SMS to {phone_number}")
    icloud.send_verification_code(devices[0])


def build_downloader_builder_args(configs: PolicyConfigs) -> dict:
    downloader_args = {
        "only_print_filenames": False,
        "dry_run": configs.dry_run,
        **configs.model_dump(),
    }
    # update the directory to be absolute path
    downloader_args["directory"] = os.path.abspath(os.path.expanduser(downloader_args["directory"]))
    builder_params = signature(download_builder).parameters.keys()
    downloader_args = {k: v for k, v in downloader_args.items() if k in builder_params}
    # Map size to primary_sizes
    downloader_args["primary_sizes"] = [AssetVersionSize(size) for size in configs.size]
    downloader_args["live_photo_size"] = LivePhotoVersionSize(configs.live_photo_size + "Video")
    downloader_args["file_match_policy"] = file_match_policy_generator(configs.file_match_policy)
    return downloader_args


def build_filename_cleaner(keep_unicode_in_filenames: bool) -> Callable[[str], str]:
    """Map keep_unicode parameter for function for cleaning filenames"""
    return compose(
        (remove_unicode_chars if not keep_unicode_in_filenames else identity),
        clean_filename,
    )


def build_lp_filename_generator(live_photo_mov_filename_policy: str) -> Callable[[str], str]:
    return (
        lp_filename_original
        if live_photo_mov_filename_policy == "original"
        else lp_filename_concatinator
    )


def file_match_policy_generator(policy: str) -> FileMatchPolicy:
    match policy:
        case "name-size-dedup-with-suffix":
            return FileMatchPolicy.NAME_SIZE_DEDUP_WITH_SUFFIX
        case "name-id7":
            return FileMatchPolicy.NAME_ID7
        case _:
            raise ValueError(f"policy was provided with unsupported value of '{policy}'")


def build_raw_policy(align_raw: str) -> str:
    match align_raw:
        case "original":
            return "as-original"
        case "alternative":
            return "as-alternative"
        case "as-is":
            return "as-is"
        case _:
            raise ValueError(f"align_raw was provided with unsupported value of '{align_raw}'")


def build_pyicloudservice_args(configs: PolicyConfigs) -> dict:
    return {
        "filename_cleaner": build_filename_cleaner(configs.keep_unicode_in_filenames),
        "lp_filename_generator": build_lp_filename_generator(
            configs.live_photo_mov_filename_policy
        ),
        "raw_policy": build_raw_policy(configs.align_raw),
        "file_match_policy": file_match_policy_generator(configs.file_match_policy),
    }
