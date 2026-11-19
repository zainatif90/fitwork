"""
Job ingestion pipeline:  fetch -> normalize -> deduplicate -> extract skills -> embed -> save.

The same `upsert_jobs` function is used by every source (Freelancer.com, CSV, manual paste),
so all jobs end up in exactly the same shape in the database.
"""
import hashlib
import logging
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, tuple_, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.job import SOURCE_MAX_AGE_HOURS, Job
from app.services import embeddings
from app.services.skill_utils import extract_skills, known_skill_names
from app.services.sources.base import JobData

log = logging.getLogger(__name__)

EMBED_BATCH = 64


@dataclass
class IngestStats:
    source: str
    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    deactivated: int = 0
    seconds: float = 0.0

    def as_dict(self) -> dict:
        return asdict(self)


def _text_fields(j: Job | JobData) -> tuple:
    return (j.title, j.description, tuple(j.skills))


def fit_to_columns(item: JobData) -> None:
    """
    Make one job fit the database column sizes, so a single unusual job can never make a whole
    batch fail (seen live: Himalayas uses job URLs up to 122 characters as IDs; the column holds 100).
    A too-long ID becomes its SHA-256 fingerprint: still unique and identical on every fetch.
    """
    if len(item.external_id) > 100:
        item.external_id = "sha256:" + hashlib.sha256(item.external_id.encode()).hexdigest()[:64]
    item.title = item.title[:300]
    if item.url and len(item.url) > 500:
        item.url = item.url[:500]
    if item.client_country:
        item.client_country = item.client_country[:80]
    item.skills = [s[:80] for s in item.skills]
    if item.url and not item.url.lower().startswith(("http://", "https://")):
        item.url = None  # only web links are shown as "Open on platform" (never javascript: etc.)


def upsert_jobs(db: Session, items: list[JobData], created_by=None) -> tuple[list[Job], int, int]:  # type: ignore[no-untyped-def]
    """
    Insert new jobs and update existing ones (same source + external_id).
    Embeddings are only (re)computed for new jobs or jobs whose text changed.
    Returns (saved_jobs, inserted_count, updated_count).
    """
    # 1. Fit the database columns, then remove duplicates inside this batch
    #    (the API can return the same project twice across pages)
    unique: dict[tuple[str, str], JobData] = {}
    for item in items:
        fit_to_columns(item)
        unique[(item.source, item.external_id)] = item
    if not unique:
        return [], 0, 0

    # 2. Fill in skills from the description when the source gave none
    known = known_skill_names(db)
    for item in unique.values():
        if not item.skills:
            item.skills = extract_skills(f"{item.title}. {item.description}", known)

    # 3. Load the jobs we already have, in one query
    existing = {
        (j.source, j.external_id): j
        for j in db.scalars(select(Job).where(tuple_(Job.source, Job.external_id).in_(list(unique.keys()))))
    }

    to_embed: list[Job] = []
    saved: list[Job] = []
    inserted = updated = 0
    for key, item in unique.items():
        job = existing.get(key)
        if job is None:
            job = Job(source=item.source, external_id=item.external_id, created_by=created_by)
            db.add(job)
            inserted += 1
            needs_embedding = True
        else:
            updated += 1
            needs_embedding = job.embedding is None or _text_fields(job) != _text_fields(item)
        for field in ("title", "description", "skills", "budget_min", "budget_max", "budget_type", "currency",
                      "client_country", "client_hire_rate", "proposals_count", "posted_at", "url"):
            setattr(job, field, getattr(item, field))
        job.is_active = True
        if needs_embedding:
            to_embed.append(job)
        saved.append(job)

    # 4. Embed in batches (much faster than one at a time)
    for start in range(0, len(to_embed), EMBED_BATCH):
        batch = to_embed[start:start + EMBED_BATCH]
        vectors = embeddings.embed_texts([embeddings.build_job_text(j.title, j.skills, j.description) for j in batch])
        for job, vec in zip(batch, vectors):
            job.embedding = vec.tolist()

    db.commit()
    if to_embed:
        embeddings.release_memory()  # keep the server's memory low between runs
    return saved, inserted, updated


def deactivate_stale_jobs(db: Session, now: datetime | None = None) -> int:
    """
    Hide live-source jobs that are too old for their source (Freelancer.com: 72 h,
    job boards: 21 days). CSV and manual jobs never expire (see CLAUDE.md).
    """
    now = now or datetime.now(timezone.utc)
    hidden = 0
    for source, hours in SOURCE_MAX_AGE_HOURS.items():
        result = db.execute(
            update(Job)
            .where(Job.is_active.is_(True), Job.source == source, Job.posted_at < now - timedelta(hours=hours))
            .values(is_active=False)
        )
        hidden += result.rowcount or 0
    db.commit()
    return hidden


def purge_old_jobs(db: Session, now: datetime | None = None, days: int | None = None) -> int:
    """
    Delete live-source jobs that expired long ago (posted more than JOB_RETENTION_DAYS ago and inactive).
    Without this the jobs table only grew (19 Nov 2026: 8,678 active jobs plus every expired one), which
    fills the free database and makes every full scan slower.
    Kept: CSV seed and manual jobs, and any job a user interacted with (feedback, a proposal or an agency
    assignment): deleting the job would delete that history too (the foreign keys cascade).
    """
    from app.models.agency import Assignment
    from app.models.feedback import MatchFeedback
    from app.models.proposal import Proposal

    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days or settings.JOB_RETENTION_DAYS)
    used = select(MatchFeedback.job_id).union(select(Proposal.job_id), select(Assignment.job_id))
    result = db.execute(
        delete(Job).where(
            Job.is_active.is_(False),
            Job.source.in_(tuple(SOURCE_MAX_AGE_HOURS)),
            Job.posted_at < cutoff,
            Job.id.not_in(used),
        )
    )
    db.commit()
    removed = result.rowcount or 0
    log.info("Purged %d jobs that expired before %s", removed, cutoff.date())
    return removed


def drop_expired(items: list[JobData], now: datetime | None = None) -> list[JobData]:
    """Skip jobs that are already too old for their source, before spending time embedding them."""
    now = now or datetime.now(timezone.utc)
    return [i for i in items if i.source not in SOURCE_MAX_AGE_HOURS
            or i.posted_at >= now - timedelta(hours=SOURCE_MAX_AGE_HOURS[i.source])]


def ingest_items(db: Session, source: str, items: list[JobData], started: float) -> IngestStats:
    _, inserted, updated = upsert_jobs(db, drop_expired(items))
    stats = IngestStats(source=source, fetched=len(items), inserted=inserted, updated=updated)
    stats.deactivated = deactivate_stale_jobs(db)
    stats.seconds = round(time.perf_counter() - started, 2)
    log.info("Ingestion run [%s]: fetched=%d inserted=%d updated=%d deactivated=%d in %.1fs",
             source, stats.fetched, stats.inserted, stats.updated, stats.deactivated, stats.seconds)
    if stats.fetched == 0:
        # A source that suddenly returns nothing usually changed its API or blocked us. /api/health/deep
        # reports it when this lasts too long (see last_fetch_ok).
        log.warning("Ingestion [%s] returned 0 jobs: the source may have changed or be down", source)
    else:
        record_fetch_ok(source)
    return stats


LAST_OK_KEY = "ingest:last_ok:{}"


def record_fetch_ok(source: str, when: datetime | None = None) -> None:
    """Remember when a source last returned jobs (used by the deep health check)."""
    from app.core.redis_client import redis_client

    try:
        redis_client.set(LAST_OK_KEY.format(source), (when or datetime.now(timezone.utc)).isoformat())
    except Exception:  # health bookkeeping must never break ingestion
        log.warning("Could not record the last successful fetch for %s", source)


def last_fetch_ok(source: str) -> datetime | None:
    from app.core.redis_client import redis_client

    try:
        value = redis_client.get(LAST_OK_KEY.format(source))
    except Exception:
        return None
    if not value:
        return None
    return datetime.fromisoformat(value.decode() if isinstance(value, bytes) else value)


def run_freelancer_ingestion(db: Session, pages: int | None = None, start_offset: int = 0) -> IngestStats:
    from app.services.sources.freelancer import FreelancerClient

    started = time.perf_counter()
    items = FreelancerClient().fetch_active(
        pages=pages or settings.FREELANCER_PAGES_PER_RUN,
        page_size=settings.FREELANCER_PAGE_SIZE,
        start_offset=start_offset,
    )
    return ingest_items(db, "freelancer", items, started)


def run_job_board_ingestion(db: Session, source: str) -> IngestStats:
    """Fetch contract/freelance jobs from one remote job board (himalayas | remotive | jobicy)."""
    from app.services.sources.job_boards import FETCHERS

    started = time.perf_counter()
    return ingest_items(db, source, FETCHERS[source](), started)
