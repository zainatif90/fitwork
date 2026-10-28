import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis_client import cache_delete
from app.models.user import User
from app.routers.matches import feedback_for, visible_job_or_404
from app.schemas.job import JobOut, ManualJobIn
from app.schemas.match import JobDetailOut
from app.services.ingestion import upsert_jobs
from app.services.matching import score_single_job
from app.services.profiles import get_profile, user_cache_keys
from app.services.sources.base import JobData

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobDetailOut)
def job_detail(job_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Full job details plus this user's score breakdown and saved feedback."""
    job = visible_job_or_404(db, job_id, user)
    profile = get_profile(db, user.id)
    match = score_single_job(db, profile, job) if profile else None
    return {"job": job, "match": match, "feedback": feedback_for(db, user.id, job.id)}


@router.post("/manual", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def add_manual_job(data: ManualJobIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):  # type: ignore[no-untyped-def]
    """Paste a job from any site. It is only visible in the matches of the user who added it."""
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
