import sys
from pathlib import Path

import pytest


FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fake_icloudpd_cmd() -> list[str]:
    return [sys.executable, str(FIXTURES / "fake_icloudpd.py")]
