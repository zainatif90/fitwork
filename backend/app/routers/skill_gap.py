from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.services.profiles import get_profile
from app.services.skill_gap import get_skill_gap

router = APIRouter(prefix="/skill-gap", tags=["skill gap"])


class SampleJob(BaseModel):
    id: str
    title: str
    score: int


class Gap(BaseModel):
    skill: str
    demand: int
    jobs_unlocked: int
    percent_increase: float | None
    sample_jobs: list[SampleJob]


class RadarPoint(BaseModel):
    skill: str
    market_demand: int
    jobs: int
    your_coverage: int
    example_job: str | None = None  # a real job in the user's field that asks for this skill


class SkillDemand(BaseModel):
    skill: str
    jobs: int


class SkillGapOut(BaseModel):
    total_active_jobs: int
    field_jobs: int  # jobs most similar to the user's profile ("your field"); gaps come only from these
    baseline_matches: int
    threshold: int
    gaps: list[Gap]
    radar: list[RadarPoint]
    your_skills: list[SkillDemand]
    coverage_message: str | None
    analysed_skills: int
    compute_ms: float
    generated_at: datetime
    cached: bool


@router.get("", response_model=SkillGapOut)
def skill_gap(refresh: bool = Query(default=False), user: User = Depends(get_current_user),
              db: Session = Depends(get_db)) -> dict:
    profile = get_profile(db, user.id)
    if profile is None:
        raise HTTPException(status_code=409, detail="Complete your profile to see your skill gaps")
    return get_skill_gap(db, profile, use_cache=not refresh)
