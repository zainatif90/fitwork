"""
Deep health check (GET /api/health/deep), polled every 3 hours by .github/workflows/health.yml.
If it answers 503 the workflow fails and GitHub emails the repository owner.

Why: on 19 Nov 2026 Skill Gap had been crashing the free server for days and nobody noticed, because the plain
/api/health kept answering "ok" between restarts. This check also looks at the things that fail quietly:
  - a job source that has not delivered a new job for too long (API changed, blocked, scheduler stopped)
  - server memory close to the 512 MB limit of the free plan
It only reports counts and times, never user data.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.job import Job

# How long each live source may go without a NEW job before we call it stale.
EXPECTED_NEW_JOB_WITHIN = {
    "freelancer": timedelta(hours=6),     # fetched every 30 min, new projects every hour
    "himalayas": timedelta(hours=72),     # boards post less often (and Remotive only a few contract roles a week)
    "remotive": timedelta(days=7),
    "jobicy": timedelta(hours=72),
}
MEMORY_LIMIT_MB = 512
MEMORY_WARN_MB = 460


def current_memory_mb() -> float | None:
    """Resident memory of this process (Linux /proc; None elsewhere, e.g. on a Windows laptop)."""
    status = Path("/proc/self/status")
    if not status.exists():
        return None
    for line in status.read_text().splitlines():
        if line.startswith("VmRSS:"):
            return round(int(line.split()[1]) / 1024, 1)
    return None


def deep_health(db: Session, now: datetime | None = None, memory_mb: float | None = None) -> tuple[bool, dict[str, Any]]:
    now = now or datetime.now(timezone.utc)
    problems: list[str] = []
    db.execute(text("SELECT 1"))

    active = db.scalar(select(func.count()).select_from(Job).where(Job.is_active.is_(True))) or 0
    newest = dict(db.execute(select(Job.source, func.max(Job.created_at)).group_by(Job.source)).all())
    sources: dict[str, Any] = {}
    if settings.SCHEDULER_ENABLED:
        for source, allowed in EXPECTED_NEW_JOB_WITHIN.items():
            if source != "freelancer" and not settings.JOB_BOARDS_ENABLED:
                continue
            last = newest.get(source)
            if last is None:
                sources[source] = {"last_new_job": None}
                continue                      # never had jobs here (e.g. a fresh database): nothing to compare
            age_h = round((now - last).total_seconds() / 3600, 1)
            stale = now - last > allowed
            sources[source] = {"last_new_job": last.isoformat(), "hours_ago": age_h, "stale": stale}
            if stale:
                problems.append(f"no new {source} job for {age_h} h")

    if active == 0:
        problems.append("no active jobs")
    memory = memory_mb if memory_mb is not None else current_memory_mb()
    if memory is not None and memory >= MEMORY_WARN_MB:
        problems.append(f"memory {memory} MB of {MEMORY_LIMIT_MB} MB")

    report = {"status": "ok" if not problems else "degraded", "problems": problems, "active_jobs": active,
              "sources": sources, "memory_mb": memory, "checked_at": now.isoformat()}
    return not problems, report
