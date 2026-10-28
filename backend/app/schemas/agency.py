import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.match import JobSummary


class AgencyRenameIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class InviteIn(BaseModel):
    email: EmailStr


class InviteTokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class AssignIn(BaseModel):
    job_id: uuid.UUID
    member_id: uuid.UUID  # the recommended member (approve) or another member (override)


class AssignmentStatusIn(BaseModel):
    status: Literal["applied", "won", "lost"]


class MemberRow(BaseModel):
    id: str
    user_id: str | None
    email: str
    name: str | None
    status: str
    invited_at: datetime
    joined_at: datetime | None


class AgencyOut(BaseModel):
    id: str
    name: str
    role: Literal["owner", "member"]
    owner_name: str
    members: list[MemberRow] = []


class InviteOut(BaseModel):
    member: MemberRow
    invite_link: str


class InviteInfoOut(BaseModel):
    agency_name: str
    invited_email: str


class MemberScore(BaseModel):
    member_id: str
    name: str
    score: int
    reason: str
    matched_skills: list[str]


class RoutingRecommendation(BaseModel):
    job: JobSummary
    recommended: MemberScore
    alternatives: list[MemberScore]
    low_team_fit: bool
    missing_skills: list[str]
    rerouted_after_decline: bool


class AssignmentOut(BaseModel):
    id: str
    job: JobSummary
    member_id: str
    member_name: str
    status: str
    score: int | None
    created_at: datetime
    updated_at: datetime


class DeclineOut(BaseModel):
    declined: AssignmentOut
    next_recommendation: RoutingRecommendation | None


class TeamMemberStats(BaseModel):
    member_id: str
    name: str
    email: str
    top_skills: list[str]
    has_profile: bool
    active_assignments: int
    win_rate_30d: float | None
    decided_30d: int
    routed_today: int


class TeamStatsOut(BaseModel):
    members: list[TeamMemberStats]
    win_rate_series: list[dict]
    has_outcomes: bool
