"""
TDD cycle 1 — "posted ... ago" text in the Match Score reason (app/services/scoring.py: humanize_age).

Bug found while reviewing scoring.py: a job posted less than a minute ago was described as
"1 minutes ago" (the number was bumped from 0 to 1, but the plural check still used 0).

Written test-first:
  RED      these tests were written before the fix and failed (see TESTING.md, TDD section)
  GREEN    humanize_age was changed until they passed
  REFACTOR the plural rule moved into one helper (_plural) used for minutes, hours and days
These are unit tests: plain inputs, no database.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.scoring import humanize_age

NOW = datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize(("age", "expected"), [
    (timedelta(seconds=0), "1 minute ago"),        # the bug: was "1 minutes ago"
    (timedelta(seconds=30), "1 minute ago"),       # the bug: was "1 minutes ago"
    (timedelta(minutes=1), "1 minute ago"),
    (timedelta(minutes=2), "2 minutes ago"),
    (timedelta(minutes=59), "59 minutes ago"),
    (timedelta(hours=1), "1 hour ago"),
    (timedelta(hours=5), "5 hours ago"),
    (timedelta(hours=47), "47 hours ago"),
    (timedelta(hours=48), "2 days ago"),
    (timedelta(days=10), "10 days ago"),
])
def test_humanize_age_uses_correct_singular_and_plural(age: timedelta, expected: str) -> None:
    assert humanize_age(NOW - age, now=NOW) == expected


def test_humanize_age_future_timestamp_is_treated_as_just_posted() -> None:
    # A job board clock a little ahead of ours must not give "-3 minutes ago".
    assert humanize_age(NOW + timedelta(minutes=3), now=NOW) == "1 minute ago"
