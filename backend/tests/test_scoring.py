"""Unit tests for each part of the Match Score formula."""
from datetime import datetime, timedelta, timezone

import pytest

from app.services import scoring

NOW = datetime(2026, 10, 28, 12, tzinfo=timezone.utc)


@pytest.mark.parametrize("cosine,expected", [(0.10, 0.0), (0.15, 0.0), (0.40, 0.5), (0.65, 1.0), (0.90, 1.0)])
def test_semantic_is_calibrated_and_clipped(cosine: float, expected: float) -> None:
    assert scoring.semantic_score(cosine) == pytest.approx(expected)


def test_budget_fit_hourly() -> None:
    assert scoring.budget_fit("hourly", 20, 40, 30) == 1.0          # inside range
    assert scoring.budget_fit("hourly", 20, 40, 50) == pytest.approx(0.5)  # 25% above max
    assert scoring.budget_fit("hourly", 20, 40, 60) == 0.0          # 50% above max
    assert scoring.budget_fit("hourly", 20, 40, 15) == pytest.approx(0.5)  # 25% below min


def test_budget_fit_fixed_uses_estimated_hours() -> None:
    assert scoring.budget_fit("fixed", 100, 500, 25) == 1.0         # 20 hours
    assert scoring.budget_fit("fixed", 10, 20, 25) == 0.0           # under 1 hour of work
    assert scoring.budget_fit("fixed", 50, 75, 25) == pytest.approx(0.5)  # 3 hours -> (3-1)/4
    assert scoring.budget_fit("fixed", 0, 15000, 25) == pytest.approx(0.0)  # 600 hours


def test_budget_fit_unknown_returns_none() -> None:
    assert scoring.budget_fit("fixed", None, None, 25) is None
    assert scoring.budget_fit("hourly", 20, 40, None) is None


def test_recency() -> None:
    assert scoring.recency_score("freelancer", NOW - timedelta(hours=2), NOW) == 1.0
    assert scoring.recency_score("freelancer", NOW - timedelta(hours=39), NOW) == pytest.approx(0.5)
    assert scoring.recency_score("freelancer", NOW - timedelta(hours=80), NOW) == 0.0
    assert scoring.recency_score("csv", NOW - timedelta(days=30), NOW) == 0.5  # seed data is neutral


def test_combine_weights_and_bounds() -> None:
    assert scoring.combine(1, 1, 1) == 100
    assert scoring.combine(0, 0, 0) == 0
    assert scoring.combine(1, 0.5, 0.5) == 85  # 70 + 7.5 + 7.5


def test_skill_overlap_uses_aliases() -> None:
    matched, missing = scoring.skill_overlap(["React", "node.js"], ["React.js", "NodeJS", "MongoDB"])
    assert matched == ["React.js", "NodeJS"]
    assert missing == ["MongoDB"]


def test_reason_text() -> None:
    parts = scoring.score_parts(0.6, "freelancer", NOW - timedelta(hours=2), "hourly", 20, 40, 30, NOW)
    reason = scoring.build_reason(parts, ["React", "Tailwind CSS"], "freelancer", NOW - timedelta(hours=2), NOW)
    assert reason == "Matches your React and Tailwind CSS skills; budget fits your rate; posted 2 hours ago"
