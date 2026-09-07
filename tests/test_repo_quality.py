from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_repository_has_no_em_dashes():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "check_no_emdash.py")],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
