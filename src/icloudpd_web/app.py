from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from fastapi import FastAPI

from icloudpd_web.api import auth as auth_router
from icloudpd_web.api import mfa as mfa_router
from icloudpd_web.api import policies as policies_router
from icloudpd_web.api import runs as runs_router
from icloudpd_web.auth import Authenticator, install_session_middleware
from icloudpd_web.config import SettingsStore
from icloudpd_web.errors import install_handlers
from icloudpd_web.integrations.apprise_notifier import AppriseNotifier
from icloudpd_web.runner.mfa import MfaRegistry
from icloudpd_web.runner.run import Run
from icloudpd_web.runner.runner import Runner
from icloudpd_web.scheduler.scheduler import Scheduler
from icloudpd_web.store.policy_store import PolicyStore
from icloudpd_web.store.secrets import SecretStore


ICLOUDPD_BINARY = "icloudpd"


def _default_icloudpd_argv(cfg_path: Path) -> list[str]:
    return [ICLOUDPD_BINARY, "--config-file", str(cfg_path)]


def create_app(
    *,
    data_dir: Path,
    authenticator: Authenticator,
    session_secret: str,
    icloudpd_argv: Callable[[Path], list[str]] = _default_icloudpd_argv,
) -> FastAPI:
    app = FastAPI(title="icloudpd-web")
    install_handlers(app)
    install_session_middleware(app, secret=session_secret)

    policies_dir = data_dir / "policies"
    runs_dir = data_dir / "runs"
    secrets_dir = data_dir / "secrets"
    mfa_dir = data_dir / "mfa"
    settings_path = data_dir / "settings.toml"

    policy_store = PolicyStore(policies_dir)
    policy_store.load()
    secret_store = SecretStore(secrets_dir)
    settings_store = SettingsStore(settings_path)
    settings = settings_store.load()

    notifier = AppriseNotifier(settings.apprise)
    mfa_registry = MfaRegistry(mfa_dir)

    def _on_run_event(run: Run, event: str) -> None:
        policy_store.bump()
        if event == "completed":
            summary = _summarize(run)
            if run.status == "success":
                notifier.emit("success", policy_name=run.policy_name, summary=summary)
            elif run.status == "failed":
                notifier.emit("failure", policy_name=run.policy_name, summary=summary)

    runner = Runner(
        runs_base=runs_dir,
        icloudpd_argv=icloudpd_argv,
        retention=settings.retention_runs,
        on_run_event=_on_run_event,
    )

    scheduler = Scheduler(
        store=policy_store,
        runner=runner,
        password_lookup=secret_store.get,
    )

    app.state.data_dir = data_dir
    app.state.authenticator = authenticator
    app.state.policy_store = policy_store
    app.state.secret_store = secret_store
    app.state.settings_store = settings_store
    app.state.notifier = notifier
    app.state.mfa_registry = mfa_registry
    app.state.runner = runner
    app.state.scheduler = scheduler

    app.include_router(auth_router.router)
    app.include_router(mfa_router.router)
    app.include_router(policies_router.router)
    app.include_router(runs_router.router)
    return app


def _summarize(run: Run) -> str:
    if run.status == "success":
        return f"{run.progress.get('downloaded', 0)} items downloaded"
    return f"exit {run.exit_code}; see log {run.run_id}"
