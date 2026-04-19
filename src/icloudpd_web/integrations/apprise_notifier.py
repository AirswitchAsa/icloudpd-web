from __future__ import annotations

import logging
from typing import Literal

import apprise

from icloudpd_web.config import AppriseSettings


log = logging.getLogger(__name__)

Event = Literal["start", "success", "failure"]


class AppriseNotifier:
    def __init__(self, settings: AppriseSettings) -> None:
        self._settings = settings
        self._client: apprise.Apprise | None = None
        self._rebuild()

    def update(self, settings: AppriseSettings) -> None:
        self._settings = settings
        self._rebuild()

    def _rebuild(self) -> None:
        if not self._settings.urls:
            self._client = None
            return
        client = apprise.Apprise()
        for url in self._settings.urls:
            client.add(url)
        self._client = client

    def _enabled_for(self, event: Event) -> bool:
        if event == "start":
            return self._settings.on_start
        if event == "success":
            return self._settings.on_success
        if event == "failure":
            return self._settings.on_failure
        return False

    def emit(self, event: Event, *, policy_name: str, summary: str) -> None:
        if self._client is None:
            return
        if not self._enabled_for(event):
            return
        title = f"[icloudpd-web] {policy_name} {event}"
        try:
            self._client.notify(title=title, body=summary)
        except Exception:
            log.exception("apprise emit failed for %s/%s", policy_name, event)
