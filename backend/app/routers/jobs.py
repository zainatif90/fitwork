import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis_client import cache_delete, hit_rate_limit
from app.models.job import Job
from app.models.user import User
from app.routers.matches import feedback_for, visible_job_or_404
from app.schemas.job import JobOut, ManualJobIn
from app.schemas.match import JobDetailOut
from app.services.ingestion import upsert_jobs
from app.services.matching import score_single_job
from app.services.profiles import get_profile, user_cache_keys
from app.services.sources.base import JobData

router = APIRouter(prefix="/jobs", tags=["jobs"])


PASTED_PER_DAY = 20
PASTED_TOTAL = 200


@router.get("/{job_id}", response_model=JobDetailOut)
def job_detail(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Full job details plus this user's score breakdown and saved feedback."""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:  # a broken link: "Job not found", not a technical validation message
        raise HTTPException(status_code=404, detail="Job not found")
    job = visible_job_or_404(db, job_uuid, user)
    profile = get_profile(db, user.id)
    match = score_single_job(db, profile, job) if profile else None
    return {"job": job, "match": match, "feedback": feedback_for(db, user.id, job.id)}


@router.post("/manual", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def add_manual_job(data: ManualJobIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):  # type: ignore[no-untyped-def]
    """Paste a job from any site. It is only visible in the matches of the user who added it."""
    # Every pasted job is embedded and stored, so there is a daily and a total limit per user.
    pasted = db.scalar(select(func.count()).select_from(Job).where(Job.source == "manual", Job.created_by == user.id)) or 0
    if pasted >= PASTED_TOTAL:
        raise HTTPException(status_code=429, detail=f"You can keep up to {PASTED_TOTAL} pasted jobs.")
    if hit_rate_limit(f"rl:paste:{user.id}", PASTED_PER_DAY, 24 * 3600):
        raise HTTPException(status_code=429, detail=f"You can paste up to {PASTED_PER_DAY} jobs a day. Please try again tomorrow.")
    item = JobData(
        source="manual",
        external_id=uuid.uuid4().hex,
        title=data.title.strip(),
        description=data.description.strip(),
        skills=data.skills,
        budget_min=data.budget_min,
        budget_max=data.budget_max,
        budget_type=data.budget_type,
        posted_at=datetime.now(timezone.utc),
        url=str(data.url) if data.url else None,
    )
    saved, _, _ = upsert_jobs(db, [item], created_by=user.id)
    cache_delete(*user_cache_keys(user.id))  # the new job should show up in matches straight away
    return saved[0]
