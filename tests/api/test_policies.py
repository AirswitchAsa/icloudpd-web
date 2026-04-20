import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


FAKE = Path(__file__).resolve().parent.parent / "fixtures" / "fake_icloudpd.py"


def _fake_argv(argv_tail: list[str]) -> list[str]:
    return [sys.executable, str(FAKE), *argv_tail]


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
        icloudpd_argv=_fake_argv,
    )
    c = TestClient(app)
    c.post("/auth/login", json={"password": "pw"})
    return c


def _policy_body(name: str = "a") -> dict:
    return {
        "name": name,
        "username": "u@icloud.com",
        "directory": "/tmp/a",
        "cron": "0 * * * *",
        "enabled": True,
        "icloudpd": {"album": "All Photos"},
        "aws": None,
    }


def test_list_empty(client: TestClient) -> None:
    r = client.get("/policies")
    assert r.status_code == 200
    assert r.json() == []


def test_put_then_get(client: TestClient) -> None:
    r = client.put("/policies/a", json=_policy_body())
    assert r.status_code == 200
    r2 = client.get("/policies/a")
    assert r2.json()["username"] == "u@icloud.com"


def test_put_invalid_cron(client: TestClient) -> None:
    body = _policy_body()
    body["cron"] = "bogus"
    r = client.put("/policies/a", json=body)
    assert r.status_code == 422


def test_put_name_mismatch_rejected(client: TestClient) -> None:
    body = _policy_body(name="a")
    r = client.put("/policies/b", json=body)
    assert r.status_code == 422


def test_delete(client: TestClient) -> None:
    client.put("/policies/a", json=_policy_body())
    r = client.delete("/policies/a")
    assert r.status_code == 200
    assert client.get("/policies/a").status_code == 404


def test_set_and_delete_password(client: TestClient) -> None:
    client.put("/policies/a", json=_policy_body())
    r = client.post("/policies/a/password", json={"password": "hunter2"})
    assert r.status_code == 204
    r2 = client.delete("/policies/a/password")
    assert r2.status_code == 204


def test_discover_libraries_requires_stored_password(client: TestClient) -> None:
    client.put("/policies/a", json=_policy_body())
    r = client.post("/policies/a/libraries/discover")
    assert r.status_code == 400
    assert "password" in r.json()["error"].lower()


def test_discover_libraries_returns_names(client: TestClient) -> None:
    client.put("/policies/a", json=_policy_body())
    client.post("/policies/a/password", json={"password": "pw"})
    r = client.post("/policies/a/libraries/discover")
    assert r.status_code == 200, r.text
    assert "PrimarySync" in r.json()["libraries"]


def test_discover_libraries_404_for_missing_policy(client: TestClient) -> None:
    r = client.post("/policies/nope/libraries/discover")
    assert r.status_code == 404


# ── export / import ──────────────────────────────────────────────────────


def test_export_roundtrips(client: TestClient) -> None:
    client.put("/policies/a", json=_policy_body())
    client.put("/policies/b", json=_policy_body("b"))
    r = client.get("/policies/export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/toml")
    text = r.text
    assert "[[policy]]" in text
    assert 'name = "a"' in text
    assert 'name = "b"' in text


def test_import_single_policy(client: TestClient) -> None:
    body = (
        'name = "newp"\n'
        'username = "u@icloud.com"\n'
        'directory = "/tmp/x"\n'
        'cron = "0 * * * *"\n'
        "enabled = true\n"
    )
    r = client.post("/policies/import", content=body)
    assert r.status_code == 200
    assert r.json() == {"created": ["newp"], "errors": []}
    assert client.get("/policies/newp").status_code == 200


def test_import_bundle(client: TestClient) -> None:
    body = (
        "[[policy]]\n"
        'name = "p1"\n'
        'username = "u@icloud.com"\n'
        'directory = "/tmp/p1"\n'
        'cron = "0 * * * *"\n'
        "[[policy]]\n"
        'name = "p2"\n'
        'username = "u@icloud.com"\n'
        'directory = "/tmp/p2"\n'
        'cron = "0 * * * *"\n'
    )
    r = client.post("/policies/import", content=body)
    assert r.status_code == 200
    assert set(r.json()["created"]) == {"p1", "p2"}


def test_import_ignores_illegal_fields(client: TestClient) -> None:
    body = (
        'name = "ok"\n'
        'username = "u@icloud.com"\n'
        'directory = "/tmp/ok"\n'
        'cron = "0 * * * *"\n'
        'nonexistent_top_level = "garbage"\n'
        "[icloudpd]\n"
        'device_make = "still-bogus"\n'  # dropped by validator
        'album = "Selfies"\n'
    )
    r = client.post("/policies/import", content=body)
    assert r.status_code == 200, r.text
    assert r.json()["created"] == ["ok"]
    got = client.get("/policies/ok").json()
    assert "device_make" not in got["icloudpd"]
    assert got["icloudpd"]["album"] == "Selfies"


def test_import_rejects_existing_name(client: TestClient) -> None:
    client.put("/policies/dupe", json=_policy_body("dupe"))
    body = 'name = "dupe"\nusername = "x@icloud.com"\ndirectory = "/tmp/dupe"\ncron = "0 * * * *"\n'
    r = client.post("/policies/import", content=body)
    assert r.status_code == 200
    payload = r.json()
    assert payload["created"] == []
    assert payload["errors"] == [{"name": "dupe", "error": "already exists"}]


def test_import_rejects_invalid_toml(client: TestClient) -> None:
    r = client.post("/policies/import", content="not valid toml ====")
    assert r.status_code == 400


def test_import_rejects_empty_body(client: TestClient) -> None:
    r = client.post("/policies/import", content="")
    assert r.status_code == 400


def test_requires_auth(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    c = TestClient(app)
    r = c.get("/policies")
    assert r.status_code == 401
