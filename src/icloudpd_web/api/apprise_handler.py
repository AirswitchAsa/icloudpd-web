import os

from apprise import Apprise, AppriseAsset, NotifyType, PersistentStoreMode  # type: ignore

from icloudpd_web.api.error import AppriseError, ICloudPdWebServerError


class AppriseHandler:
    @property
    def servers(self: "AppriseHandler") -> list[str]:
        return [server.service_name for server in self._apprise_client.servers]  # type: ignore

    def __init__(self: "AppriseHandler", apprise_config_path: str | None) -> None:
        try:
            apprise_asset = self._maybe_load_apprise_asset(apprise_config_path)
            self._apprise_client = Apprise(asset=apprise_asset)
        except Exception as e:
            raise ICloudPdWebServerError(f"Failed to load Apprise asset: {e}") from e

    def _maybe_load_apprise_asset(
        self: "AppriseHandler", apprise_config_path: str | None
    ) -> AppriseAsset:
        # store asset at ~/.icloudpd_web/
        asset_path = os.path.expanduser("~/.icloudpd_web/")
        apprise_config_path = apprise_config_path or asset_path
        asset = AppriseAsset(
            storage_path=apprise_config_path,  # type: ignore
            storage_mode=PersistentStoreMode.FLUSH,  # type: ignore
            storage_idlen=8,  # type: ignore
        )
        return asset

    def add_config(self: "AppriseHandler", config: str | list[str]) -> None:
        if not self._apprise_client.add(config):
            raise AppriseError("Failed to add Apprise config")

    def reset_config(self: "AppriseHandler") -> None:
        self._apprise_client.clear()

    def warning(self: "AppriseHandler", title: str, message: str) -> None:
        if not self.servers:
            return
        if not self._apprise_client.notify(
            body=message, title=title, notify_type=NotifyType.WARNING
        ):
            raise AppriseError("Failed to send warning notification")

    def failure(self: "AppriseHandler", title: str, message: str) -> None:
        if not self.servers:
            return
        if not self._apprise_client.notify(
            body=message, title=title, notify_type=NotifyType.FAILURE
        ):
            raise AppriseError("Failed to send failure notification")

    def info(self: "AppriseHandler", title: str, message: str) -> None:
        if not self.servers:
            return
        if not self._apprise_client.notify(body=message, title=title, notify_type=NotifyType.INFO):
            raise AppriseError("Failed to send info notification")
