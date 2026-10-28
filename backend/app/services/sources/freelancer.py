"""
Freelancer.com source.

Uses the official public Projects API (no login needed for reading active projects):
    GET https://www.freelancer.com/api/projects/0.1/projects/active/
Docs: https://developers.freelancer.com/docs/projects/projects#projects-search-active-projects

Polite usage: one request at a time, a delay between pages, and retries with exponential
backoff on network errors, HTTP 429 (too many requests) and 5xx errors.
"""
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import settings
from app.services.sources.base import JobData

log = logging.getLogger(__name__)

ACTIVE_PROJECTS_PATH = "/projects/0.1/projects/active/"
MAX_RETRIES = 4


def _to_usd(amount: Any, exchange_rate: float) -> float | None:
    if amount is None:
        return None
    try:
        return round(float(amount) * exchange_rate, 2)
    except (TypeError, ValueError):
        return None


def normalize_project(p: dict[str, Any]) -> JobData | None:
    """Convert one Freelancer.com project into our JobData. Returns None if it is unusable."""
    project_id = p.get("id")
    title = (p.get("title") or "").strip()
    description = (p.get("description") or p.get("preview_description") or "").strip()
    submitted = p.get("time_submitted") or p.get("submitdate")
    if not project_id or not title or not submitted:
        return None

    currency = p.get("currency") or {}
    # Freelancer.com gives each currency's rate to USD, so all budgets can be compared in USD.
    rate = float(currency.get("exchange_rate") or 1.0)
    budget = p.get("budget") or {}
    budget_type = "hourly" if p.get("type") == "hourly" else "fixed"

    location = p.get("location") or {}
    country = (location.get("country") or {}).get("name") if isinstance(location, dict) else None

    seo_url = p.get("seo_url")
    return JobData(
        source="freelancer",
        external_id=str(project_id),
        title=title[:300],
        description=description or title,
        skills=[j["name"] for j in (p.get("jobs") or []) if j.get("name")],
        budget_min=_to_usd(budget.get("minimum"), rate),
        budget_max=_to_usd(budget.get("maximum"), rate),
        budget_type=budget_type,
        currency="USD",
        client_country=country or None,
        client_hire_rate=None,  # not exposed by the public API
        proposals_count=(p.get("bid_stats") or {}).get("bid_count"),
        posted_at=datetime.fromtimestamp(int(submitted), tz=timezone.utc),
        url=f"https://www.freelancer.com/projects/{seo_url}" if seo_url else None,
    )


class FreelancerClient:
    def __init__(self, client: httpx.Client | None = None, delay_sec: float | None = None) -> None:
        headers = {"User-Agent": "FitWork-FYP/1.0 (academic project)"}
        if settings.FREELANCER_API_TOKEN:
            headers["freelancer-oauth-v1"] = settings.FREELANCER_API_TOKEN
        self.client = client or httpx.Client(base_url=settings.FREELANCER_API_BASE, headers=headers, timeout=20.0)
        self.delay_sec = settings.FREELANCER_REQUEST_DELAY_SEC if delay_sec is None else delay_sec

    def _get(self, params: dict[str, Any]) -> dict[str, Any]:
        """GET with retries: waits 1s, 2s, 4s, 8s (or the server's Retry-After) between attempts."""
        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                res = self.client.get(ACTIVE_PROJECTS_PATH, params=params)
                if res.status_code == 429 or res.status_code >= 500:
                    raise httpx.HTTPStatusError(f"HTTP {res.status_code}", request=res.request, response=res)
                res.raise_for_status()
                return res.json()
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
                if status is not None and status < 500 and status != 429:
                    raise  # 4xx (except 429) will not fix itself by retrying
                last_error = exc
                if attempt == MAX_RETRIES:
                    break
                wait = 2 ** attempt
                if isinstance(exc, httpx.HTTPStatusError):
                    retry_after = exc.response.headers.get("Retry-After")
                    if retry_after and retry_after.isdigit():
                        wait = int(retry_after)
                log.warning("Freelancer.com request failed (%s), retry %d in %ss", exc, attempt + 1, wait)
                time.sleep(wait)
        raise RuntimeError(f"Freelancer.com API failed after {MAX_RETRIES} retries: {last_error}")

    def fetch_active(self, pages: int, page_size: int, start_offset: int = 0) -> list[JobData]:
        """Fetch `pages` pages of the newest active projects and normalize them."""
        jobs: list[JobData] = []
        for page in range(pages):
            if page > 0:
                time.sleep(self.delay_sec)  # be polite between pages
            data = self._get({
                "limit": page_size,
                "offset": start_offset + page * page_size,
                "full_description": "true",
                "job_details": "true",
                "compact": "true",
            })
            projects = (data.get("result") or {}).get("projects") or []
            for p in projects:
                job = normalize_project(p)
                if job:
                    jobs.append(job)
            # Stop only on an empty page: the API sometimes returns a few less than `limit`
            # (hidden/non-public projects are filtered out) even when more pages exist.
            if not projects:
                break
        return jobs
