from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from icloudpd_web.auth import require_auth
from icloudpd_web.config import ServerSettings


router = APIRouter(
    prefix="/settings",
    tags=["settings"],
    dependencies=[Depends(require_auth)],
)


@router.get("")
def get_settings(request: Request) -> dict:
    store = request.app.state.settings_store
    return store.load().model_dump(mode="json")


@router.put("")
def put_settings(body: ServerSettings, request: Request) -> dict:
    store = request.app.state.settings_store
    store.save(body)
    request.app.state.notifier.update(body.apprise)
    request.app.state.runner._retention = body.retention_runs  # noqa: SLF001
    return body.model_dump(mode="json")
