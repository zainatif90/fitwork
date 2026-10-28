import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.proposal import Proposal
from app.models.user import User
from app.routers.matches import visible_job_or_404
from app.schemas.proposal import GeneratedProposalOut, ProposalIn, ProposalOut
from app.services.profiles import get_profile
from app.services.proposals import RateLimitExceeded, generate_and_save, remaining_today

router = APIRouter(prefix="/proposals", tags=["proposals"])


@router.post("/generate", response_model=GeneratedProposalOut)
def generate(data: ProposalIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    job = visible_job_or_404(db, data.job_id, user)
    profile = get_profile(db, user.id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Complete your profile before generating proposals")
    try:
        proposal = generate_and_save(db, user, profile, job, data.tone, data.length)
    except RateLimitExceeded:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"You have used all {settings.PROPOSALS_PER_DAY} proposal generations for today. Try again tomorrow.",
        )
    return {**ProposalOut.model_validate(proposal).model_dump(), "remaining_today": remaining_today(user.id)}


@router.get("", response_model=list[ProposalOut])
def history(job_id: uuid.UUID | None = Query(default=None), user: User = Depends(get_current_user),
            db: Session = Depends(get_db)) -> list[Proposal]:
    stmt = select(Proposal).where(Proposal.user_id == user.id)
    if job_id:
        stmt = stmt.where(Proposal.job_id == job_id)
    return list(db.scalars(stmt.order_by(Proposal.created_at.desc()).limit(50)))


@router.get("/quota")
def quota(user: User = Depends(get_current_user)) -> dict[str, int]:
    return {"remaining_today": remaining_today(user.id), "daily_limit": settings.PROPOSALS_PER_DAY}
