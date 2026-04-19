from pathlib import Path

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


def test_app_has_all_components(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    assert hasattr(app.state, "policy_store")
    assert hasattr(app.state, "secret_store")
    assert hasattr(app.state, "settings_store")
    assert hasattr(app.state, "runner")
    assert hasattr(app.state, "scheduler")
    assert hasattr(app.state, "notifier")
    assert hasattr(app.state, "mfa_registry")
