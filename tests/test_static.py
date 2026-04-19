from pathlib import Path

from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


def _make_dist(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><html>app</html>")
    (dist / "assets" / "main.js").write_text("console.log('x');")
    return dist


def test_index_served_at_root(tmp_path: Path) -> None:
    dist = _make_dist(tmp_path)
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "<html>app</html>" in r.text


def test_asset_served(tmp_path: Path) -> None:
    dist = _make_dist(tmp_path)
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/assets/main.js")
        assert r.status_code == 200
        assert "console.log" in r.text


def test_spa_catchall_returns_index(tmp_path: Path) -> None:
    dist = _make_dist(tmp_path)
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/some/deep/route")
        assert r.status_code == 200
        assert "<html>app</html>" in r.text


def test_api_routes_not_shadowed(tmp_path: Path) -> None:
    dist = _make_dist(tmp_path)
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/auth/status")
        assert r.status_code == 200
        assert r.json()["auth_required"] is False


def test_spa_catchall_rejects_encoded_traversal(tmp_path: Path) -> None:
    dist = _make_dist(tmp_path)
    (tmp_path / "secret.txt").write_text("SECRETDATA")
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        for attempt in ["/%2e%2e/secret.txt", "/%2E%2E%2Fsecret.txt", "/%2e%2e%2fsecret.txt"]:
            r = c.get(attempt)
            assert "SECRETDATA" not in r.text, f"leaked via {attempt}"
            assert r.status_code == 200  # falls back to index
            assert "<html>app</html>" in r.text


def test_empty_static_dir_returns_placeholder(tmp_path: Path) -> None:
    # Directory exists but has no index.html (e.g., just .gitkeep)
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / ".gitkeep").write_text("")
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "not built" in r.text.lower() or "web_dist" in r.text.lower()


def test_spa_serves_existing_file_in_dist(tmp_path: Path) -> None:
    """SPA route returns a resolved file when full_path resolves to an existing file."""
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><html>app</html>")
    # Place a file directly in dist (no assets/ dir), so it hits the _spa route's is_file() branch
    (dist / "robots.txt").write_text("User-agent: *")
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/robots.txt")
        assert r.status_code == 200
        assert "User-agent" in r.text


def test_spa_no_assets_dir(tmp_path: Path) -> None:
    """install_static works when there is no assets/ subdirectory."""
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><html>app</html>")
    # Deliberately no dist/assets/ directory
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "<html>app</html>" in r.text


def test_no_static_dir_returns_placeholder(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=None,
    )
    with TestClient(app) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "web_dist" in r.text.lower() or "not built" in r.text.lower()
