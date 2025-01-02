from icloudpd_api.data_models import PolicyConfigs
from icloudpd.status import StatusExchange
from icloudpd.config import Config

from pyicloud_ipd.base import PyiCloudService

from enum import Enum

import asyncio


class PolicyStatus(Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    WAITING_FOR_MFA = "waiting_for_mfa"


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

    @status.setter
    def status(self, value: PolicyStatus):
        assert isinstance(value, PolicyStatus), "Status must be a PolicyStatus"
        self._status = value

    @property
    def progress(self) -> int:
        assert self.status == PolicyStatus.RUNNING, "Can only get progress when policy is running"
        return self._progress

    @progress.setter
    def progress(self, value: int):
        assert self.status == PolicyStatus.RUNNING, "Can only set progress when policy is running"
        assert isinstance(value, int), "Progress must be an integer"
        assert 0 <= value <= 100, "Progress must be between 0 and 100"
        self._progress = value

    @property
    def icloud(self) -> PyiCloudService | None:
        return self._icloud

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
            **self._configs.model_dump(),
        }
        for exclude in excludes:
            policy_dict.pop(exclude, None)
        return policy_dict

    def update(self, **kwargs):
        """
        Update the policy configs and the status exchange. Should only be called when status is STOPPED.
        """
        assert self._status == PolicyStatus.STOPPED, "Can only update policy when policy is stopped"

        self._configs = self._configs.model_copy(update=kwargs)

    async def download(self):
        """
        Start running the policy for download.
        """
        self._status = PolicyStatus.RUNNING
        # status_exchange = StatusExchange()
        # status_exchange.set_config(Config(**self._configs.model_dump()))

        # TODO: Implement the function
        while self.progress < 100:
            await asyncio.sleep(1)
            self.progress += 1
            if self.progress >= 100:
                break
        self._status = PolicyStatus.STOPPED
