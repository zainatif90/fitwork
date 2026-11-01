import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis_client import cache_delete
from app.models.feedback import MatchFeedback
from app.models.job import Job
from app.models.user import User
from app.schemas.match import FeedbackIn, FeedbackOut, MatchesOut
from app.services.matching import get_matches, score_single_job
from app.services.profiles import get_profile

router = APIRouter(prefix="/matches", tags=["matches"])


def visible_job_or_404(db: Session, job_id: uuid.UUID, user: User) -> Job:
    job = db.get(Job, job_id)
    if job is None or (job.source == "manual" and job.created_by != user.id):
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("", response_model=MatchesOut)
def my_matches(
    refresh: bool = Query(default=False, description="Ignore the cache and recompute"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    profile = get_profile(db, user.id)
    if profile is None:
        raise HTTPException(status_code=409, detail="Complete your profile to see matches")
    return get_matches(db, profile, use_cache=not refresh)


@router.post("/{job_id}/feedback", response_model=FeedbackOut)
def give_feedback(job_id: uuid.UUID, data: FeedbackIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)) -> FeedbackOut:
    """Store what happened with this job. Saving again for the same job updates the outcome."""
    job = visible_job_or_404(db, job_id, user)
    profile = get_profile(db, user.id)
    score = None
    if profile is not None:
        result = score_single_job(db, profile, job)
        score = result["score"] if result else None

    stmt = insert(MatchFeedback).values(
        id=uuid.uuid4(), user_id=user.id, job_id=job.id, outcome=data.outcome, score_at_feedback=score
    )
    # Upsert: one feedback row per (user, job)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_feedback_user_job",
        set_={"outcome": stmt.excluded.outcome, "score_at_feedback": stmt.excluded.score_at_feedback},
    )
    db.execute(stmt)
    db.commit()
    cache_delete(f"matches:{user.id}")  # the job leaves the top 5 and the next best moves up
    return FeedbackOut(job_id=str(job.id), outcome=data.outcome, score_at_feedback=score)


def feedback_for(db: Session, user_id: uuid.UUID, job_id: uuid.UUID) -> str | None:
    return db.scalar(select(MatchFeedback.outcome).where(MatchFeedback.user_id == user_id, MatchFeedback.job_id == job_id))
