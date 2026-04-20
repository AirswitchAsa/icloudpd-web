from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    c = TestClient(app)
    c.post("/auth/login", json={"password": "pw"})
    return c


def test_mfa_provide_without_registration_404(client: TestClient) -> None:
    r = client.post("/policies/p/mfa", json={"code": "000000"})
    assert r.status_code == 404
