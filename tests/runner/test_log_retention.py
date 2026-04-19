import os
import time
from pathlib import Path

from icloudpd_web.runner.log_retention import prune_logs


def test_keeps_newest_n(tmp_path: Path) -> None:
    for i in range(12):
        p = tmp_path / f"policy-{i:02d}.log"
        p.write_text("x")
        ts = time.time() + i
        os.utime(p, (ts, ts))

    kept = prune_logs(tmp_path, keep=10)
    files = sorted(p.name for p in tmp_path.iterdir())
    assert len(files) == 10
    assert "policy-00.log" not in files
    assert "policy-11.log" in files
    assert kept == 10


def test_noop_when_under_limit(tmp_path: Path) -> None:
    for i in range(3):
        (tmp_path / f"x{i}.log").write_text("x")
    prune_logs(tmp_path, keep=10)
    assert len(list(tmp_path.iterdir())) == 3


def test_missing_dir_ok(tmp_path: Path) -> None:
    prune_logs(tmp_path / "nope", keep=10)
