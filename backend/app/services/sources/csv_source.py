"""
CSV seed source.

Column format (header row required, UTF-8):
    external_id      unique id of the job inside this file (text)
    title            job title (required)
    description      full job description (required)
    skills           skill tags separated by ";"  e.g. "React;Tailwind CSS;Node.js"
    budget_min       number in USD, may be empty
    budget_max       number in USD, may be empty
    budget_type      "fixed" or "hourly"
    currency         3-letter code, use USD (budgets must already be in USD)
    client_country   may be empty
    proposals_count  integer, may be empty
    posted_at        ISO 8601 date-time, e.g. 2026-10-28T09:15:00Z
    url              link to the original listing, may be empty
"""
import csv
from datetime import datetime, timezone
from pathlib import Path

from app.services.sources.base import JobData

CSV_COLUMNS = [
    "external_id", "title", "description", "skills", "budget_min", "budget_max", "budget_type",
    "currency", "client_country", "proposals_count", "posted_at", "url",
]


class CsvFormatError(ValueError):
    pass


def _num(value: str) -> float | None:
    value = (value or "").strip()
    return float(value) if value else None


def parse_row(row: dict[str, str], line_no: int) -> JobData:
    title = (row.get("title") or "").strip()
    description = (row.get("description") or "").strip()
    if not title or not description:
        raise CsvFormatError(f"Line {line_no}: title and description are required")
    budget_type = (row.get("budget_type") or "fixed").strip().lower()
    if budget_type not in ("fixed", "hourly"):
        raise CsvFormatError(f"Line {line_no}: budget_type must be 'fixed' or 'hourly'")
    try:
        posted_at = datetime.fromisoformat((row.get("posted_at") or "").strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise CsvFormatError(f"Line {line_no}: posted_at must be ISO 8601 ({exc})") from exc
    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    try:
        budget_min, budget_max = _num(row.get("budget_min", "")), _num(row.get("budget_max", ""))
        proposals = row.get("proposals_count", "").strip()
        proposals_count = int(float(proposals)) if proposals else None
    except ValueError as exc:
        raise CsvFormatError(f"Line {line_no}: budget/proposals must be numbers ({exc})") from exc

    return JobData(
        source="csv",
        external_id=(row.get("external_id") or "").strip() or f"line-{line_no}",
        title=title[:300],
        description=description,
        skills=[s.strip() for s in (row.get("skills") or "").split(";") if s.strip()],
        budget_min=budget_min,
        budget_max=budget_max,
        budget_type=budget_type,
        currency=(row.get("currency") or "USD").strip().upper()[:3] or "USD",
        client_country=(row.get("client_country") or "").strip() or None,
        proposals_count=proposals_count,
        posted_at=posted_at,
        url=(row.get("url") or "").strip() or None,
    )


def read_jobs_csv(path: str | Path) -> list[JobData]:
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = {"title", "description", "posted_at"} - set(reader.fieldnames or [])
        if missing:
            raise CsvFormatError(f"CSV is missing required columns: {', '.join(sorted(missing))}")
        # line 1 is the header, so data starts on line 2
        return [parse_row(row, i) for i, row in enumerate(reader, start=2)]
