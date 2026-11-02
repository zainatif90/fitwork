from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.job import JobOut


class Weights(BaseModel):
    semantic: float
    budget_fit: float
    recency: float


class Breakdown(BaseModel):
    semantic: float     # 0-1, calibrated cosine similarity
    budget_fit: float   # 0-1 (0.5 = unknown)
    recency: float      # 0-1 (0.5 = not a live job)
    cosine: float       # raw cosine similarity, for transparency
    budget_known: bool
    fit_gate: float = 1.0  # share of budget + recency credit the job gets (1 = full; < 1 for weak fits)
    weights: Weights


class JobSummary(BaseModel):
    id: str
    source: str
    title: str
    description_preview: str
    skills: list[str]
    budget_min: float | None
    budget_max: float | None
    budget_type: str
    currency: str
    proposals_count: int | None
    posted_at: datetime
    url: str | None
    is_active: bool = True  # False once the job has closed (expired on its platform)


class MatchOut(BaseModel):
    job_id: str
    score: int
    breakdown: Breakdown
    reason: str
    matched_skills: list[str]
    missing_skills: list[str]
    job: JobSummary


class MatchStats(BaseModel):
    candidates_considered: int
    strong_matches: int
    average_score: float
    top_source: str | None


class MatchesOut(BaseModel):
    matches: list[MatchOut]
    stats: MatchStats
    generated_at: datetime
    compute_ms: float
    cached: bool


class MatchScoreOut(BaseModel):
    job_id: str
    score: int
    breakdown: Breakdown
    reason: str
    matched_skills: list[str]
    missing_skills: list[str]


Outcome = Literal["applied", "won", "lost", "not_relevant"]


class FeedbackIn(BaseModel):
    outcome: Outcome


class FeedbackOut(BaseModel):
    job_id: str
    outcome: Outcome
    score_at_feedback: int | None


class JobDetailOut(BaseModel):
    job: JobOut
    match: MatchScoreOut | None   # null when the user has no profile yet
    feedback: Outcome | None
