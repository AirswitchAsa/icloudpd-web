from icloudpd_api.data_models import PolicyConfigs, AuthenticationResult
from icloudpd_api.icloud_helper import (
    build_filename_cleaner,
    build_lp_filename_generator,
    file_match_policy_generator,
)

from pyicloud_ipd.base import PyiCloudService
from pyicloud_ipd.exceptions import PyiCloudFailedLoginException

from enum import Enum

import asyncio


class PolicyStatus(Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    SCHEDULED = "scheduled"


class PolicyHandler:
    @property
    def name(self) -> str:
        return self._name

    @name.setter
    def name(self, value: str):
        assert isinstance(value, str), "Policy name must be a string"
        self._name = value

    @property
    def status(self) -> PolicyStatus:
        return self._status

    @property
    def progress(self) -> int:
        assert self._status == PolicyStatus.RUNNING, "Can only get progress when policy is running"
        return self._progress

    @progress.setter
    def progress(self, value: int):
        assert self._status == PolicyStatus.RUNNING, "Can only set progress when policy is running"
        assert isinstance(value, int), "Progress must be an integer"
        assert 0 <= value <= 100, "Progress must be between 0 and 100"
        self._progress = value

    @property
    def authenticated(self) -> bool:
        return (
            self._icloud is not None
            and not self._icloud.requires_2sa
            and not self._icloud.requires_2fa
        )

    def __init__(self, name: str, **kwargs):
        self._name = name
        self._configs = PolicyConfigs(**kwargs)  # validate the configs and fill-in defaults
        self._status = PolicyStatus.STOPPED
        self._icloud = None
        self._progress = 0

    def dump(self, excludes: list[str] = []) -> dict:
        policy_dict = {
            "name": self._name,
            "status": self._status.value,
            "progress": self._progress,
            "authenticated": self.authenticated,
            **self._configs.model_dump(),
        }
        for exclude in excludes:
            policy_dict.pop(exclude, None)
        return policy_dict

    def update(self, **kwargs):
        """
        Update the policy configs. Should only be called when status is STOPPED.
        """
        assert self._status == PolicyStatus.STOPPED, "Can only update policy when policy is stopped"

        self._configs = self._configs.model_copy(update=kwargs)

    def authenticate(self, password: str):
        """
        Create the icloud instance with the given password. User may need to provide MFA code to finish authentication.
        """
        assert self._status == PolicyStatus.STOPPED, "Can only authenticate when policy is stopped"
        assert not self.authenticated, "Can only authenticate when it is not authenticated"
        try:
            self._icloud = PyiCloudService(
                filename_cleaner=build_filename_cleaner(self._configs.keep_unicode_in_filenames),
                lp_filename_generator=build_lp_filename_generator(
                    self._configs.live_photo_mov_filename_policy
                ),
                domain=self._configs.domain,
                raw_policy=self._configs.align_raw,
                file_match_policy=file_match_policy_generator(self._configs.file_match_policy),
                apple_id=self._configs.username,
                password=password,
            )
        except PyiCloudFailedLoginException as e:
            return AuthenticationResult.FAILED, e.args[0]
        if self.authenticated:
            return AuthenticationResult.SUCCESS, "Authenticated."
        else:
            return AuthenticationResult.MFA_REQUIRED, "MFA required."

    def provide_mfa(self, mfa_code: str):
        """
        Provide the MFA code to the icloud instance to finish authentication.
        """
        assert not self.authenticated, "Can only provide MFA when policy is not authenticated"
        self._icloud.validate_2fa_code(mfa_code)
        if not self.authenticated:
            return AuthenticationResult.MFA_REQUIRED, "Wrong MFA code."
        else:
            self._status = PolicyStatus.STOPPED
            return AuthenticationResult.SUCCESS, "Authenticated."

    async def download(self):
        """
        Start running the policy for download.
        """
        self._status = PolicyStatus.RUNNING

        # TODO: Implement the function
        while self.progress < 100:
            await asyncio.sleep(1)
            self.progress += 1
            if self.progress >= 100:
                break
        self._status = PolicyStatus.STOPPED
