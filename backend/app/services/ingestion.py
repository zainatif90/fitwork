"""
Job ingestion pipeline:  fetch -> normalize -> deduplicate -> extract skills -> embed -> save.

The same `upsert_jobs` function is used by every source (Freelancer.com, CSV, manual paste),
so all jobs end up in exactly the same shape in the database.
"""
import logging
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, tuple_, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.job import LIVE_SOURCES, Job
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


def upsert_jobs(db: Session, items: list[JobData], created_by=None) -> tuple[list[Job], int, int]:  # type: ignore[no-untyped-def]
    """
    Insert new jobs and update existing ones (same source + external_id).
    Embeddings are only (re)computed for new jobs or jobs whose text changed.
    Returns (saved_jobs, inserted_count, updated_count).
    """
    # 1. Remove duplicates inside this batch (the API can return the same project twice across pages)
    unique: dict[tuple[str, str], JobData] = {}
    for item in items:
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
    return saved, inserted, updated


def deactivate_stale_jobs(db: Session, now: datetime | None = None) -> int:
    """Live-source jobs older than 72h are hidden. CSV and manual jobs never expire (see CLAUDE.md)."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=settings.LIVE_JOB_MAX_AGE_HOURS)
    result = db.execute(
        update(Job)
        .where(Job.is_active.is_(True), Job.source.in_(LIVE_SOURCES), Job.posted_at < cutoff)
        .values(is_active=False)
    )
    db.commit()
    return result.rowcount or 0


def ingest_items(db: Session, source: str, items: list[JobData], started: float) -> IngestStats:
    _, inserted, updated = upsert_jobs(db, items)
    stats = IngestStats(source=source, fetched=len(items), inserted=inserted, updated=updated)
    stats.deactivated = deactivate_stale_jobs(db)
    stats.seconds = round(time.perf_counter() - started, 2)
    log.info("Ingestion run [%s]: fetched=%d inserted=%d updated=%d deactivated=%d in %.1fs",
             source, stats.fetched, stats.inserted, stats.updated, stats.deactivated, stats.seconds)
    return stats


def run_freelancer_ingestion(db: Session, pages: int | None = None, start_offset: int = 0) -> IngestStats:
    from app.services.sources.freelancer import FreelancerClient

    started = time.perf_counter()
    items = FreelancerClient().fetch_active(
        pages=pages or settings.FREELANCER_PAGES_PER_RUN,
        page_size=settings.FREELANCER_PAGE_SIZE,
        start_offset=start_offset,
    )
    return ingest_items(db, "freelancer", items, started)
