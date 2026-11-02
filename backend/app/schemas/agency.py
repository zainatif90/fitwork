import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.match import JobSummary


class AgencyRenameIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)

    @field_validator("name")
    @classmethod
    def plain_name(cls, v: str) -> str:
        """The name goes into invite emails, so links and HTML are refused (seen in testing: a phishing link)."""
        v = v.strip()
        if len(v) < 2:  # checked after trimming, so a name of only spaces is refused
            raise ValueError("Agency name must have at least 2 characters")
        low = v.lower()
        if any(bad in low for bad in ("<", ">", "http:", "https:", "www.", "://")):
            raise ValueError("Agency name can't contain links or the characters < >")
        return v


class InviteIn(BaseModel):
    email: EmailStr


class InviteTokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class AssignIn(BaseModel):
    job_id: uuid.UUID
    member_id: uuid.UUID  # the recommended member (approve) or another member (override)


class ReassignIn(BaseModel):
    member_id: uuid.UUID


class CloseAgencyIn(BaseModel):
    confirm_name: str = Field(min_length=1, max_length=120)


class AssignmentStatusIn(BaseModel):
    status: Literal["applied", "won", "lost"]


class MemberRow(BaseModel):
    id: str
    user_id: str | None
    email: str
    name: str | None
    status: str
    invited_at: datetime  # when the current invite link was sent
    joined_at: datetime | None
    invite_expired: bool = False


class AgencyOut(BaseModel):
    id: str
    name: str
    role: Literal["owner", "member"]
    owner_name: str
    members: list[MemberRow] = []


class InviteOut(BaseModel):
    member: MemberRow
    invite_link: str   # built from FRONTEND_URL (used in the dev email log)
    invite_token: str  # the browser builds the link from its own address, so it is right on any domain
    email_sent: bool   # False in development, where emails are only printed to the console


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
    is_owner: bool = False
    top_skills: list[str]
    has_profile: bool
    active_assignments: int
    win_rate_30d: float | None
    decided_30d: int
    routed_today: int


class MemberResults(BaseModel):
    member_id: str
    name: str
    current: bool  # False = has left the agency (their results still count in the history)
    assigned: int
    applied: int
    won: int
    lost: int


class TeamStatsOut(BaseModel):
    members: list[TeamMemberStats]
    results: list[MemberResults]
    totals: dict[str, int]  # assigned / applied / won / lost / declined over ALL of the agency's assignments
    win_rate_series: list[dict]
    has_outcomes: bool
