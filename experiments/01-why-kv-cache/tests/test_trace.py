from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from decode import run_experiment  # noqa: E402
from validate_trace import load_and_validate, validate_trace  # noqa: E402

SAMPLE = ROOT / "traces" / "sample.json"


def test_generated_trace_is_valid():
    trace = run_experiment("the cat sat on the mat", max_new_tokens=6, seed=42)
    assert validate_trace(trace) == []


def test_committed_sample_is_valid():
    assert SAMPLE.exists(), "run `python3 run.py` to write traces/sample.json"
    assert load_and_validate(str(SAMPLE)) == []


def test_sample_matches_schema_contract():
    data = json.loads(SAMPLE.read_text(encoding="utf-8"))
    assert data["schemaVersion"] == "0.1.0"
    assert data["experimentId"] == "01-why-kv-cache"
    assert data["modes"]["naive"]["steps"]
    assert data["modes"]["cached"]["steps"]
    assert "educational" in data["measurementDisclaimer"].lower()


def test_empty_prompt_still_runs():
    trace = run_experiment("   ", max_new_tokens=2, seed=0)
    assert validate_trace(trace) == []
    assert trace["equivalence"]["outputsMatch"]
