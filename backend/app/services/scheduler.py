"""
Background scheduler (APScheduler) that fetches Freelancer.com jobs every 30 minutes.

- Disabled with SCHEDULER_ENABLED=false (tests always disable it).
- A Redis lock makes sure only one fetch runs at a time, even if the app is started twice.
- A "last run" key prevents re-fetching on every dev auto-reload.
"""
import logging

import redis
from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.redis_client import redis_client

log = logging.getLogger(__name__)

LOCK_KEY = "ingest:lock"
LAST_RUN_KEY = "ingest:last_run"

_scheduler: BackgroundScheduler | None = None


def scheduled_ingestion() -> None:
    from app.services.ingestion import run_freelancer_ingestion

    try:
        if redis_client.exists(LAST_RUN_KEY):
            log.info("Scheduled ingestion skipped: last run was less than %d min ago", settings.INGEST_INTERVAL_MIN)
            return
        # nx=True -> only set if no one else holds the lock; ex -> lock auto-expires after 15 min
        if not redis_client.set(LOCK_KEY, "1", nx=True, ex=900):
            log.info("Scheduled ingestion skipped: another run is in progress")
            return
    except redis.RedisError as exc:
        log.warning("Redis unavailable, running ingestion without lock: %s", exc)

    db = SessionLocal()
    try:
        run_freelancer_ingestion(db)
        try:
            redis_client.setex(LAST_RUN_KEY, settings.INGEST_INTERVAL_MIN * 60 - 30, "1")
        except redis.RedisError:
            pass
    except Exception:
        log.exception("Scheduled ingestion failed")
    finally:
        db.close()
        try:
            redis_client.delete(LOCK_KEY)
        except redis.RedisError:
            pass


def start_scheduler() -> None:
    global _scheduler
    if not settings.SCHEDULER_ENABLED:
        log.info("Scheduler disabled (SCHEDULER_ENABLED=false)")
        return
    from datetime import datetime, timedelta, timezone

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        scheduled_ingestion,
        "interval",
        minutes=settings.INGEST_INTERVAL_MIN,
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=10),  # first run shortly after startup
        id="freelancer_ingestion",
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    log.info("Scheduler started: Freelancer.com fetch every %d min", settings.INGEST_INTERVAL_MIN)


def stop_scheduler() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
