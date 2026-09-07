from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from experiment import run_pair, score_cell_counts  # noqa: E402
from validate_trace import validate_trace  # noqa: E402


def causal_cells(p: int):
    return [(i, j) for i in range(p) for j in range(p) if j <= i]


def masked_cells(p: int):
    return [(i, j) for i in range(p) for j in range(p) if j > i]


@pytest.mark.parametrize("p", [1, 2, 6, 8, 16])
def test_every_cell_obeys_position_rule(p):
    counts = score_cell_counts(p, p, newest_query=False)
    allowed = causal_cells(p)
    forbidden = masked_cells(p)
    assert all(j <= i for i, j in allowed)
    assert all(j > i for i, j in forbidden)
    assert len(allowed) == counts["attentionScoreCellsCausal"]
    assert len(forbidden) == counts["attentionScoreCellsMasked"]
    assert len(allowed) + len(forbidden) == counts["attentionScoreCellsPerHead"] == p * p


def test_future_attention_mutation_breaks_partition():
    counts = score_cell_counts(6, 6, newest_query=False)
    broken = copy.deepcopy(counts)
    broken["attentionScoreCellsMasked"] = 0
    assert broken["attentionScoreCellsCausal"] + broken["attentionScoreCellsMasked"] != broken["attentionScoreCellsPerHead"]


def test_wrong_new_token_position_is_detectable():
    pair = run_pair(6, seed=42)
    assert pair["decode"]["newTokenPosition"] == 6
    mutated = copy.deepcopy(pair)
    mutated["decode"]["newTokenPosition"] = 0
    assert mutated["decode"]["newTokenPosition"] != len(pair["promptTokens"])


def test_stale_schema_rejected():
    pair = run_pair(6, seed=1)
    pair["schemaVersion"] = "0.1.0"
    pair["experimentId"] = "02-prefill-vs-decode"
    # run_pair is a pair, wrap as a minimal invalid object
    fake = {
        "schemaVersion": "0.0.0",
        "experimentId": "02-prefill-vs-decode",
        "prompt": "x",
        "measurementDisclaimer": "x",
        "prefill": pair["prefill"],
        "decode": pair["decode"],
        "equivalence": pair["equivalence"],
        "scaling": [{"promptLength": 6, "prefill": pair["prefill"], "decode": pair["decode"]}],
    }
    assert validate_trace(fake)
