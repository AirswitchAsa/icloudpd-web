from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI

from icloudpd_web.api import auth as auth_router
from icloudpd_web.auth import Authenticator, install_session_middleware
from icloudpd_web.errors import install_handlers


def create_app(
    *,
    data_dir: Path,
    authenticator: Authenticator,
    session_secret: str,
) -> FastAPI:
    app = FastAPI(title="icloudpd-web")
    install_handlers(app)
    install_session_middleware(app, secret=session_secret)
    app.state.data_dir = data_dir
    app.state.authenticator = authenticator
    app.include_router(auth_router.router)
    return app
