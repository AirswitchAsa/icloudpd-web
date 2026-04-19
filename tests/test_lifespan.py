from pathlib import Path

from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


def test_scheduler_task_started_on_enter(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    with TestClient(app) as c:
        # Hit a route so the lifespan is entered.
        assert c.get("/auth/status").status_code == 200
        assert app.state.scheduler_task is not None
        assert not app.state.scheduler_task.done()
    assert app.state.scheduler_task.done()
