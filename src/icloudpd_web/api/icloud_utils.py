from foundation.core import compose, identity
from icloudpd.paths import clean_filename, remove_unicode_chars
from icloudpd.base import lp_filename_concatinator, lp_filename_original, download_builder

from pyicloud_ipd.file_match import FileMatchPolicy
from pyicloud_ipd.base import PyiCloudService
from icloudpd_web.api.data_models import PolicyConfigs

from typing import Callable

from inspect import signature


class ICloudManager:
    def __init__(self):
        self._icloud_instances: dict[str, PyiCloudService] = {}

    def get_instance(self, username: str) -> PyiCloudService | None:
        """
        Get the instance for the given username.
        """
        return self._icloud_instances.get(username)

    def set_instance(self, username: str, instance: PyiCloudService):
        """
        Set the instance for the given username.
        """
        assert (
            self._icloud_instances.get(username) is None
        ), "Trying to set an icloud instance that already exists"
        self._icloud_instances[username] = instance

    def update_instance(self, username: str, attributes: dict):
        """
        Update the attributes of the instance with the given username.
        """
        instance = self._icloud_instances.get(username)
        assert instance is not None, "Trying to update non-existing instance"
        for key in attributes:
            assert hasattr(instance, key), f"Instance does not have attribute '{key}'"
        for key, value in attributes.items():
            setattr(instance, key, value)

    def remove_instances(self, active_usernames: list[str]):
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
    print(f"Requesting 2SA code via SMS to {phone_number}")
    icloud.send_verification_code(devices[0])


def build_downloader_builder_args(configs: PolicyConfigs) -> dict:
    downloader_args = {
        "only_print_filenames": False,
        "dry_run": False,
        **configs.model_dump(),
    }
    builder_params = signature(download_builder).parameters.keys()
    downloader_args = {k: v for k, v in downloader_args.items() if k in builder_params}
    # Map size to primary_sizes
    downloader_args["primary_sizes"] = configs.size
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
