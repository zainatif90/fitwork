"""
Currency conversion with the Frankfurter API (European Central Bank rates; added 19 Nov 2026).
Before: job-board salaries in EUR / GBP / INR were left empty, so those jobs always got a neutral budget fit (0.5).
The network is never called here: rates are injected. If the API is down, nothing is guessed (same as before).
"""
from typing import Any

import httpx
import pytest

from app.services import fx
from app.services.sources.job_boards import normalize_himalayas, normalize_jobicy, parse_salary_text
from tests.test_job_boards import HIMALAYAS

RATES = {"EUR": 0.9, "GBP": 0.75, "INR": 90.0}   # units of each currency per 1 USD


@pytest.fixture
def rates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(fx, "usd_rates", lambda: RATES)


def test_to_usd_converts_with_the_daily_rate(rates: None) -> None:
    assert fx.to_usd(90, "EUR") == 100.0          # 90 EUR / 0.9 = 100 USD
    assert fx.to_usd(75, "gbp") == 100.0
    assert fx.to_usd(42, "USD") == 42             # USD needs no rate
    assert fx.to_usd(None, "EUR") is None
    assert fx.to_usd(10, "XYZ") is None           # unknown currency: not guessed


def test_without_rates_nothing_is_guessed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(fx, "usd_rates", lambda: None)
    assert fx.to_usd(90, "EUR") is None
    assert fx.to_usd(42, "USD") == 42


def test_himalayas_eur_salary_is_converted(rates: None) -> None:
    job = normalize_himalayas({**HIMALAYAS, "currency": "EUR"})   # 40-60 EUR per hour
    assert job is not None and (job.budget_min, job.budget_max) == (44.44, 66.67)


def test_jobicy_gbp_yearly_salary_is_converted(rates: None) -> None:
    job = normalize_jobicy({"id": 7, "jobTitle": "Contract React developer", "jobType": ["Contract"],
                            "pubDate": "2026-11-18T10:00:00Z", "salaryCurrency": "GBP", "salaryPeriod": "yearly",
                            "salaryMin": 78000, "salaryMax": 93600, "jobDescription": "<p>React</p>", "url": "https://x"})
    # 78,000 GBP / year = 37.50 GBP / hour = 50.00 USD / hour
    assert job is not None and (job.budget_min, job.budget_max) == (50.0, 60.0)


@pytest.mark.parametrize("text,expected", [
    ("€50K", (26.71, 26.71)),           # 50,000 EUR a year -> 24.04 EUR/h -> 26.71 USD/h
    ("£30 - £45 per hour", (40.0, 60.0)),
    ("₹1,80,000 per month", (11.54, 11.54)),
])
def test_remotive_salary_text_in_other_currencies(rates: None, text: str, expected: tuple) -> None:
    assert parse_salary_text(text) == expected


def test_rates_are_fetched_once_and_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    class Res:
        status_code = 200

        def json(self) -> dict[str, Any]:
            return {"base": "USD", "rates": RATES}

        def raise_for_status(self) -> None:
            return None

    def fake_get(url: str, **kwargs: Any) -> Res:
        calls.append(url)
        return Res()

    monkeypatch.setattr(fx.settings, "FX_ENABLED", True)
    monkeypatch.setattr(fx.httpx, "get", fake_get)
    fx.clear_cache()
    assert fx.usd_rates() == RATES and fx.usd_rates() == RATES
    assert len(calls) == 1 and "frankfurter" in calls[0]
    fx.clear_cache()


def test_api_failure_returns_none_and_does_not_raise(monkeypatch: pytest.MonkeyPatch) -> None:
    def down(url: str, **kwargs: Any) -> None:
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(fx.settings, "FX_ENABLED", True)
    monkeypatch.setattr(fx.httpx, "get", down)
    fx.clear_cache()
    assert fx.usd_rates() is None
    fx.clear_cache()
