from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI

from icloudpd_web import __version__
from icloudpd_web.api import auth as auth_router
from icloudpd_web.api import mfa as mfa_router
from icloudpd_web.api import policies as policies_router
from icloudpd_web.api import runs as runs_router
from icloudpd_web.api import settings as settings_router
from icloudpd_web.api import streams as streams_router
from icloudpd_web.auth import Authenticator, install_session_middleware
from icloudpd_web.config import SettingsStore
from icloudpd_web.errors import install_handlers
from icloudpd_web.integrations.apprise_notifier import AppriseNotifier
from icloudpd_web.integrations.aws_sync import AwsSync
from icloudpd_web.runner.mfa import MfaRegistry
from icloudpd_web.runner.run import Run
from icloudpd_web.runner.runner import Runner
from icloudpd_web.scheduler.scheduler import Scheduler
from icloudpd_web.static import install_static
from icloudpd_web.store.policy_store import PolicyStore
from icloudpd_web.store.secrets import SecretStore


ICLOUDPD_BINARY = "icloudpd"
DEFAULT_COOKIE_DIR = "/.pyicloud"

# Disable a policy's schedule after this many consecutive wrong-password
# failures — each cron retry with a bad password risks an Apple lockout.
AUTH_FAILURE_DISABLE_THRESHOLD = 3


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.scheduler_task = asyncio.create_task(app.state.scheduler.run_forever())
    try:
        yield
    finally:
        app.state.scheduler.stop()
        app.state.scheduler_task.cancel()
        with suppress(asyncio.CancelledError, Exception):
            await app.state.scheduler_task


def _make_icloudpd_argv(cookie_dir: str) -> Callable[[list[str]], list[str]]:
    """Build an argv factory that injects --cookie-directory unless the policy already sets it."""
    def _argv(argv_tail: list[str]) -> list[str]:
        base = [ICLOUDPD_BINARY]
        if "--cookie-directory" not in argv_tail:
            base += ["--cookie-directory", cookie_dir]
        return base + argv_tail
    return _argv


def create_app(
    *,
    data_dir: Path,
    authenticator: Authenticator,
    session_secret: str,
    cookie_dir: str = DEFAULT_COOKIE_DIR,
    icloudpd_argv: Callable[[list[str]], list[str]] | None = None,
    static_dir: Path | None = None,
) -> FastAPI:
    app = FastAPI(title="icloudpd-web", lifespan=_lifespan)

    @app.get("/version")
    def version() -> dict[str, str]:
        return {
            "version": os.environ.get("ICLOUDPD_WEB_VERSION", __version__),
        }

    if icloudpd_argv is None:
        icloudpd_argv = _make_icloudpd_argv(cookie_dir)

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
    aws_sync = AwsSync()
    mfa_registry = MfaRegistry(mfa_dir)
    # Consecutive wrong-password failures per policy (reset on success).
    auth_failures: dict[str, int] = {}

    def _on_run_event(run: Run, event: str) -> None:
        policy_store.bump()
        if event == "started":
            notifier.emit("start", policy_name=run.policy_name, summary=_summarize(run))
            return
        if event == "mfa_required":
            notifier.emit(
                "mfa_required",
                policy_name=run.policy_name,
                summary=(
                    "Run is waiting for a 2FA code — open icloudpd-web and "
                    "enter the code before the MFA timeout expires."
                ),
            )
            return
        if event == "completed":
            _handle_run_completed(run, policy_store, notifier, aws_sync, auth_failures)

    runner = Runner(
        runs_base=runs_dir,
        icloudpd_argv=icloudpd_argv,
        retention=settings.retention_runs,
        on_run_event=_on_run_event,
        mfa_registry=mfa_registry,
        # Persist Apple session cookies under data_dir so 2FA survives
        # restarts/container recreates (policies can still override).
        default_cookie_directory=data_dir / "cookies",
        mfa_timeout=settings.mfa_timeout_seconds,
    )

    def _on_scheduled_start_failure(policy_name: str, reason: str) -> None:
        notifier.emit(
            "failure",
            policy_name=policy_name,
            summary=f"scheduled run failed to start: {reason}",
        )

    scheduler = Scheduler(
        store=policy_store,
        runner=runner,
        password_lookup=secret_store.get,
        on_start_failure=_on_scheduled_start_failure,
    )

    app.state.data_dir = data_dir
    app.state.authenticator = authenticator
    app.state.policy_store = policy_store
    app.state.secret_store = secret_store
    app.state.settings_store = settings_store
    app.state.notifier = notifier
    app.state.aws_sync = aws_sync
    app.state.mfa_registry = mfa_registry
    app.state.runner = runner
    app.state.scheduler = scheduler

    app.include_router(auth_router.router)
    app.include_router(mfa_router.router)
    # streams must register before policies/runs — GET /policies/stream
    # would otherwise be captured by GET /policies/{name}.
    app.include_router(streams_router.router)
    app.include_router(policies_router.router)
    app.include_router(runs_router.router)
    app.include_router(settings_router.router)
    install_static(app, static_dir)
    return app


def _handle_run_completed(
    run: Run,
    policy_store: PolicyStore,
    notifier: AppriseNotifier,
    aws_sync: AwsSync,
    auth_failures: dict[str, int],
) -> None:
    summary = _summarize(run)
    policy = policy_store.get(run.policy_name)
    if run.status == "success":
        auth_failures.pop(run.policy_name, None)
        notifier.emit("success", policy_name=run.policy_name, summary=summary)
        if policy is not None and policy.aws is not None and policy.aws.enabled:
            asyncio.create_task(aws_sync.run(policy.aws, source=Path(policy.directory)))
    elif run.status == "failed":
        if run.failure_reason == "bad_password":
            summary = f"wrong iCloud password — update the stored password ({summary})"
            count = auth_failures.get(run.policy_name, 0) + 1
            auth_failures[run.policy_name] = count
            if count >= AUTH_FAILURE_DISABLE_THRESHOLD and policy is not None and policy.enabled:
                # Stop hammering Apple with a bad password (lockout risk).
                policy_store.put(policy.model_copy(update={"enabled": False}))
                summary += f"; schedule disabled after {count} consecutive authentication failures"
        notifier.emit("failure", policy_name=run.policy_name, summary=summary)


def _summarize(run: Run) -> str:
    if run.status == "success":
        return f"{run.progress.get('downloaded', 0)} items downloaded"
    return f"exit {run.exit_code}; see log {run.run_id}"
