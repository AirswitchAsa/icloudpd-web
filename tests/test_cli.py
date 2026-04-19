import subprocess
import sys


def test_help_runs() -> None:
    r = subprocess.run(
        [sys.executable, "-m", "icloudpd_web", "--help"],
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0
    assert "--port" in r.stdout


def test_init_password_hashes() -> None:
    r = subprocess.run(
        [sys.executable, "-m", "icloudpd_web", "init-password", "hunter2"],
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0
    assert r.stdout.strip().startswith("scrypt$")
