"""Per-module coverage floors.

Re-asserts that specific modules never drop below 100 % line coverage.
Requires coverage.py (pytest-cov brings it in) and reads the current
`.coverage` data file.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from coverage import Coverage


NAMED_MODULES = {
    "src/icloudpd_web/auth.py": 100,
    "src/icloudpd_web/static.py": 100,
    "src/icloudpd_web/errors.py": 100,
    "src/icloudpd_web/runner/config_builder.py": 100,
}


def _module_line_percent(cov: Coverage, relative_path: str) -> float:
    analysis = cov.analysis2(str(Path(relative_path).resolve()))
    executable = analysis[1]
    missing = analysis[3]
    if not executable:
        return 100.0
    return 100.0 * (1 - len(missing) / len(executable))


@pytest.mark.parametrize(("module", "floor"), list(NAMED_MODULES.items()))
def test_module_coverage_floor(module: str, floor: int) -> None:
    db = Path(".coverage")
    if not db.exists():
        pytest.skip(".coverage not present; run under pytest-cov")
    cov = Coverage(data_file=str(db))
    cov.load()
    pct = _module_line_percent(cov, module)
    assert pct >= floor, f"{module}: {pct:.1f}% < {floor}%"
