import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_admin
from app.models.job import Job
from app.models.user import User
from app.schemas.job import IngestRunIn, IngestStatsOut
from app.services.ingestion import run_freelancer_ingestion

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/ingest/run", response_model=IngestStatsOut)
def trigger_ingestion(
    data: IngestRunIn | None = None, _: User = Depends(require_admin), db: Session = Depends(get_db)
) -> IngestStatsOut:
    """Run one Freelancer.com fetch now (admin only)."""
    data = data or IngestRunIn()
    try:
        stats = run_freelancer_ingestion(db, pages=data.pages, start_offset=data.start_offset)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"Job source unavailable: {exc}") from exc
    return IngestStatsOut(**stats.as_dict())


@router.get("/jobs/stats")
def job_stats(_: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    rows = db.execute(select(Job.source, Job.is_active, func.count()).group_by(Job.source, Job.is_active)).all()
    return {"by_source": [{"source": s, "active": a, "count": c} for s, a, c in rows]}


# ---- Called by a cloud scheduler (no user logged in) -------------------------------------
# On Google Cloud Run the app sleeps when nobody uses it, so the in-app 30-minute timer cannot be
# relied on. Instead Google Cloud Scheduler calls this endpoint every 30 minutes with a secret header.
internal_router = APIRouter(prefix="/internal", tags=["internal"])


@internal_router.post("/ingest", response_model=IngestStatsOut)
def scheduled_ingest(x_cron_secret: str | None = Header(default=None), db: Session = Depends(get_db)) -> IngestStatsOut:
    # compare_digest takes the same time for right and wrong secrets (no timing attack)
    if not settings.CRON_SECRET or not x_cron_secret or not hmac.compare_digest(x_cron_secret, settings.CRON_SECRET):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        stats = run_freelancer_ingestion(db)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"Job source unavailable: {exc}") from exc
    return IngestStatsOut(**stats.as_dict())
