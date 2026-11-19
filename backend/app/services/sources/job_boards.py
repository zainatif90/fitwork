"""
Remote job boards with open, documented job APIs. Only contract / freelance roles are kept,
because FitWork is for freelancers.

| Board     | Endpoint                                      | Their rule we follow                         |
|-----------|-----------------------------------------------|----------------------------------------------|
| Himalayas | himalayas.app/jobs/api/search (Contractor)    | credit + link to the original posting        |
| Remotive  | remotive.com/api/remote-jobs                  | credit + link; only a few requests per day   |
| Jobicy    | jobicy.com/api/v2/remote-jobs                 | credit + "apply" goes to the original URL    |

Every job keeps its original URL ("Open on platform") and shows the board's name as its badge.
Budgets are converted to USD per hour when the board gives a pay period (hourly, monthly or yearly). Other
currencies are converted with the day's European Central Bank rate (app/services/fx.py, Frankfurter API).
Otherwise the budget is left empty and the Match Score uses a neutral budget fit.
"""
import html
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.services.sources.base import JobData

log = logging.getLogger(__name__)

HEADERS = {"User-Agent": "FitWork-FYP/1.0 (academic project; links back to every original posting)"}
HOURS_PER_YEAR = 2080  # 40 h x 52 weeks: converts a yearly salary to an hourly rate
_TAGS = re.compile(r"<[^>]+>")


def html_to_text(raw: str | None) -> str:
    """Job descriptions arrive as HTML; keep the words and line breaks only."""
    if not raw:
        return ""
    text = re.sub(r"(?i)<\s*(br|/p|/li|/h\d|/div)\s*/?>", "\n", raw)
    text = html.unescape(_TAGS.sub(" ", text))
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def to_hourly(amount: Any, period: str | None) -> float | None:
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    period = (period or "").lower()
    if period.startswith("hour"):
        return round(value, 2)
    if period.startswith("year") or period.startswith("annual"):
        return round(value / HOURS_PER_YEAR, 2)
    if period.startswith("month"):
        return round(value * 12 / HOURS_PER_YEAR, 2)
    return None


_CURRENCY_HINTS = (("€", "EUR"), ("eur", "EUR"), ("£", "GBP"), ("gbp", "GBP"), ("₹", "INR"), ("inr", "INR"))


def hourly_usd(lo: float | None, hi: float | None, currency: str | None) -> tuple[float | None, float | None]:
    """Hourly amounts in any currency -> USD with today's ECB rate (fx.py). Unknown rate -> (None, None)."""
    from app.services.fx import to_usd

    lo_usd, hi_usd = to_usd(lo, currency), to_usd(hi, currency)
    if (lo is not None and lo_usd is None) or (hi is not None and hi_usd is None):
        return None, None  # no rate for this currency: leave the budget empty rather than guess
    return lo_usd, hi_usd


def parse_salary_text(text: str | None) -> tuple[float | None, float | None]:
    """
    Remotive gives salary as free text, e.g. "70K-80K", "$60,000 - $90,000", "$40/hour", "€50K", "₹1,80,000 per month".
    Returns an hourly (min, max) in USD, or (None, None) when it cannot be read reliably.
    """
    if not text:
        return None, None
    t = text.lower().replace(",", "")
    currency = next((code for hint, code in _CURRENCY_HINTS if hint in t), "USD")
    numbers = [float(n) * (1000 if k else 1) for n, k in re.findall(r"(\d+(?:\.\d+)?)\s*(k)?", t)]
    if not numbers:
        return None, None
    lo, hi = min(numbers), max(numbers)
    if "hour" in t or "/hr" in t or hi < 300:
        rate = (lo, hi)
    elif "month" in t:  # e.g. "per month": before 19 Nov 2026 this was read as a yearly salary (12x too low)
        rate = (lo * 12 / HOURS_PER_YEAR, hi * 12 / HOURS_PER_YEAR)
    elif hi >= 10000:  # a yearly salary
        rate = (lo / HOURS_PER_YEAR, hi / HOURS_PER_YEAR)
    else:
        return None, None
    return hourly_usd(round(rate[0], 2), round(rate[1], 2), currency)


def _get(url: str, params: dict[str, Any] | None = None, client: httpx.Client | None = None) -> Any:
    c = client or httpx.Client(headers=HEADERS, timeout=40, follow_redirects=True)
    for attempt in range(3):
        try:
            res = c.get(url, params=params)
            if res.status_code == 429 or res.status_code >= 500:
                raise httpx.HTTPStatusError(f"HTTP {res.status_code}", request=res.request, response=res)
            res.raise_for_status()
            return res.json()
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            if attempt == 2:
                raise RuntimeError(f"{url} failed: {exc}") from exc
            time.sleep(2 ** attempt)
    return None


# ---------------------------------------------------------------- Himalayas

def normalize_himalayas(j: dict[str, Any]) -> JobData | None:
    if not j.get("title") or not j.get("guid") or not j.get("pubDate"):
        return None
    period = j.get("salaryPeriod")
    lo, hi = hourly_usd(to_hourly(j.get("minSalary"), period), to_hourly(j.get("maxSalary"), period), j.get("currency"))
    location = j.get("locationRestrictions") or []
    return JobData(
        source="himalayas",
        external_id=j["guid"],
        title=j["title"].strip()[:300],
        description=html_to_text(j.get("description")) or j.get("excerpt") or j["title"],
        skills=[],  # extracted from the text against our skills table (categories are too broad)
        budget_min=lo, budget_max=hi or lo,
        budget_type="hourly", currency="USD",
        client_country=", ".join(location)[:80] if location else None,
        posted_at=datetime.fromtimestamp(int(j["pubDate"]), tz=timezone.utc),
        url=j.get("applicationLink") or j["guid"],
    )


def fetch_himalayas(pages: int = 5, client: httpx.Client | None = None) -> list[JobData]:
    jobs: list[JobData] = []
    for page in range(1, pages + 1):
        # The search endpoint pages with page=1,2,3... ("offset" is ignored: checked 30 Oct 2026)
        data = _get("https://himalayas.app/jobs/api/search",
                    {"employment_type": "Contractor", "limit": 20, "page": page, "sort": "recent"}, client)
        items = (data or {}).get("jobs") or []
        jobs += [job for job in (normalize_himalayas(i) for i in items) if job]
        if not items:
            break
        time.sleep(1.0)  # be polite between pages
    return jobs


# ---------------------------------------------------------------- Remotive

def normalize_remotive(j: dict[str, Any]) -> JobData | None:
    if j.get("job_type") not in ("freelance", "contract") or not j.get("title") or not j.get("id"):
        return None
    try:
        posted = datetime.fromisoformat(str(j["publication_date"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return None
    if posted.tzinfo is None:
        posted = posted.replace(tzinfo=timezone.utc)
    lo, hi = parse_salary_text(j.get("salary"))
    return JobData(
        source="remotive",
        external_id=str(j["id"]),
        title=j["title"].strip()[:300],
        description=html_to_text(j.get("description")) or j["title"],
        skills=[],
        budget_min=lo, budget_max=hi,
        budget_type="hourly", currency="USD",
        client_country=(j.get("candidate_required_location") or None),
        posted_at=posted,
        url=j.get("url"),
    )


def fetch_remotive(client: httpx.Client | None = None) -> list[JobData]:
    data = _get("https://remotive.com/api/remote-jobs", None, client)
    return [job for job in (normalize_remotive(i) for i in (data or {}).get("jobs", [])) if job]


# ---------------------------------------------------------------- Jobicy

def normalize_jobicy(j: dict[str, Any]) -> JobData | None:
    types = j.get("jobType") or []
    if isinstance(types, str):
        types = [types]
    if not any(t.lower() in ("contract", "freelance") for t in types) or not j.get("jobTitle") or not j.get("id"):
        return None
    try:
        posted = datetime.fromisoformat(str(j["pubDate"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return None
    period = j.get("salaryPeriod") or ("yearly" if j.get("annualSalaryMin") else None)
    lo, hi = hourly_usd(to_hourly(j.get("salaryMin") or j.get("annualSalaryMin"), period),
                        to_hourly(j.get("salaryMax") or j.get("annualSalaryMax"), period), j.get("salaryCurrency"))
    return JobData(
        source="jobicy",
        external_id=str(j["id"]),
        title=html.unescape(j["jobTitle"]).strip()[:300],
        description=html_to_text(j.get("jobDescription")) or j.get("jobExcerpt") or j["jobTitle"],
        skills=[],
        budget_min=lo, budget_max=hi or lo,
        budget_type="hourly", currency="USD",
        client_country=(j.get("jobGeo") or None),
        posted_at=posted if posted.tzinfo else posted.replace(tzinfo=timezone.utc),
        url=j.get("url"),
    )


def fetch_jobicy(client: httpx.Client | None = None) -> list[JobData]:
    data = _get("https://jobicy.com/api/v2/remote-jobs", {"count": 100}, client)
    return [job for job in (normalize_jobicy(i) for i in (data or {}).get("jobs", [])) if job]


FETCHERS = {"himalayas": fetch_himalayas, "remotive": fetch_remotive, "jobicy": fetch_jobicy}
