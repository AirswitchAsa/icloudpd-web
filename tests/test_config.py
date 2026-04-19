from pathlib import Path

from icloudpd_web.config import ServerSettings, SettingsStore


def test_defaults() -> None:
    s = ServerSettings()
    assert s.apprise.urls == []
    assert s.apprise.on_success is True
    assert s.retention_runs == 10


def test_save_and_load_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "settings.toml"
    store = SettingsStore(path)
    s = store.load()
    s.apprise.urls = ["mailto://x"]
    s.retention_runs = 5
    store.save(s)

    store2 = SettingsStore(path)
    s2 = store2.load()
    assert s2.apprise.urls == ["mailto://x"]
    assert s2.retention_runs == 5


def test_missing_file_returns_defaults(tmp_path: Path) -> None:
    store = SettingsStore(tmp_path / "nope.toml")
    s = store.load()
    assert s.apprise.urls == []
