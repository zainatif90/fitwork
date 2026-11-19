"""
Exchange rates for converting job-board salaries to USD (added 19 Nov 2026).

API: Frankfurter (https://frankfurter.dev): free, no key, daily reference rates published by the European Central
Bank. GET https://api.frankfurter.dev/v1/latest?base=USD -> {"rates": {"EUR": 0.91, "GBP": 0.76, "INR": 93.4, ...}}
meaning "units of that currency per 1 USD", so  usd = amount / rate.

Why: before this, any salary not in USD was left empty, so those jobs always got a neutral budget fit (0.5) whatever
the pay. Rates are fetched at most every FX_CACHE_HOURS and kept in memory. If the API cannot be reached, nothing is
guessed: the budget stays empty exactly as before (never invent data).
"""
import logging
import threading
import time

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"
_lock = threading.Lock()
_cache: dict[str, object] = {"rates": None, "at": 0.0}


def clear_cache() -> None:
    with _lock:
        _cache["rates"], _cache["at"] = None, 0.0


def usd_rates() -> dict[str, float] | None:
    """Units of each currency per 1 USD, or None when disabled or unavailable."""
    if not settings.FX_ENABLED:
        return None
    with _lock:
        if _cache["rates"] is not None and time.monotonic() - float(_cache["at"]) < settings.FX_CACHE_HOURS * 3600:
            return _cache["rates"]  # type: ignore[return-value]
        try:
            res = httpx.get(FRANKFURTER_URL, params={"base": "USD"}, timeout=15, follow_redirects=True)
            res.raise_for_status()
            rates = {k.upper(): float(v) for k, v in res.json()["rates"].items() if float(v) > 0}
        except Exception as exc:  # network, HTTP or format problem: keep going without conversion
            log.warning("Exchange rates unavailable (%s): non-USD salaries stay empty", exc)
            return None
        _cache["rates"], _cache["at"] = rates, time.monotonic()
        log.info("Exchange rates loaded for %d currencies", len(rates))
        return rates


def to_usd(amount: float | None, currency: str | None) -> float | None:
    """Convert an amount to USD (2 decimals). None if the amount is missing or the rate is unknown."""
    if amount is None:
        return None
    cur = (currency or "USD").upper()
    if cur == "USD":
        return amount
    rates = usd_rates()
    rate = rates.get(cur) if rates else None
    return round(amount / rate, 2) if rate else None
