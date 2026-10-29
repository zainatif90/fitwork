"""
First-start setup for a fresh production database (enabled with BOOTSTRAP_DATA=true).

On startup, in a background thread so the API is reachable at once: if no seed jobs exist yet,
load data/jobs_seed.csv (494 real Freelancer.com listings). Live jobs are then added by the
scheduler every 30 minutes. Only missing data is added, so restarting the server is safe.
"""
import logging
import threading
import time
from pathlib import Path

from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.job import Job

log = logging.getLogger(__name__)


def run_bootstrap() -> None:
    db = SessionLocal()
    try:
        seed = Path(settings.SEED_CSV_PATH)
        has_seed = db.scalar(select(func.count()).select_from(Job).where(Job.source == "csv")) or 0
        if not has_seed and seed.exists():
            from app.services.ingestion import ingest_items
            from app.services.sources.csv_source import read_jobs_csv

            log.info("Bootstrap: loading seed jobs from %s", seed)
            stats = ingest_items(db, "csv", read_jobs_csv(seed), time.perf_counter())
            log.info("Bootstrap: seed loaded (%d new jobs)", stats.inserted)
        log.info("Bootstrap: done")
    except Exception:
        log.exception("Bootstrap failed (the API keeps running)")
    finally:
        db.close()


def start_bootstrap() -> None:
    if settings.BOOTSTRAP_DATA:
        threading.Thread(target=run_bootstrap, name="bootstrap", daemon=True).start()
