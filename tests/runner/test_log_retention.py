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


def test_prunes_meta_json_alongside_log(tmp_path: Path) -> None:
    """Pruned .log files should also remove their matching .meta.json sidecar."""
    for i in range(12):
        p = tmp_path / f"policy-{i:02d}.log"
        p.write_text("x")
        ts = time.time() + i
        os.utime(p, (ts, ts))
        # Create matching sidecar.
        (tmp_path / f"policy-{i:02d}.meta.json").write_text("{}")

    prune_logs(tmp_path, keep=10)

    remaining_logs = {p.name for p in tmp_path.iterdir() if p.suffix == ".log"}
    remaining_meta = {p.name for p in tmp_path.iterdir() if p.name.endswith(".meta.json")}

    assert len(remaining_logs) == 10
    # Sidecars for kept logs remain; sidecars for pruned logs are removed.
    assert "policy-00.meta.json" not in remaining_meta
    assert "policy-01.meta.json" not in remaining_meta
    assert "policy-11.meta.json" in remaining_meta


def test_prune_log_without_sidecar_ok(tmp_path: Path) -> None:
    """Pruning a .log that has no sidecar should not raise."""
    for i in range(12):
        p = tmp_path / f"policy-{i:02d}.log"
        p.write_text("x")
        ts = time.time() + i
        os.utime(p, (ts, ts))
        # No sidecars created — should be fine.

    kept = prune_logs(tmp_path, keep=10)
    assert kept == 10
