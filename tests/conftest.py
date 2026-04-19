import sys
from pathlib import Path

import pytest


FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fake_icloudpd_cmd() -> list[str]:
    return [sys.executable, str(FIXTURES / "fake_icloudpd.py")]


# Modules that must never drop below 100 % line coverage.
_NAMED_MODULE_FLOORS = {
    "src/icloudpd_web/auth.py": 100,
    "src/icloudpd_web/static.py": 100,
    "src/icloudpd_web/errors.py": 100,
    "src/icloudpd_web/runner/config_builder.py": 100,
}


@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Enforce per-module coverage floors AFTER pytest-cov has written .coverage.

    Runs with trylast=True so pytest-cov's own session-finish hook (which flushes
    the SQLite data file) completes first. If any named module dropped below its
    floor, mark the session as failed.
    """
    if exitstatus != 0:
        return  # tests already failing; don't pile on
    try:
        from coverage import Coverage
    except ImportError:
        return  # coverage not installed; nothing to enforce

    db = Path(".coverage")
    if not db.exists():
        return  # --no-cov mode; gate skipped by design

    cov = Coverage(data_file=str(db))
    cov.load()

    failures: list[str] = []
    for module, floor in _NAMED_MODULE_FLOORS.items():
        path = Path(module).resolve()
        if not path.exists():
            failures.append(f"{module}: source file not found")
            continue
        analysis = cov.analysis2(str(path))
        executable = analysis[1]
        missing = analysis[3]
        pct = 100.0 if not executable else 100.0 * (1 - len(missing) / len(executable))
        if pct < floor:
            failures.append(f"{module}: {pct:.1f}% < {floor}% (missing lines: {sorted(missing)})")

    if failures:
        sys.stderr.write("\nFAIL: per-module coverage floors violated:\n")
        for f in failures:
            sys.stderr.write(f"  {f}\n")
        session.exitstatus = 1
