"""
Agency job routing (UC-4).

For an agency with members M1..Mn:
1. Candidate jobs = union of every active member's top-20 nearest jobs (pgvector).
2. For every candidate job, compute EVERY member's Match Score with the same scoring
   code used for solo freelancers (app/services/matching.py).
3. Recommend the member with the highest score. If even the best score is below 50,
   flag the job "Low Team Fit" and list the job skills nobody in the team has.
4. Jobs already assigned inside the agency are skipped. Members who declined a job are
   never recommended for that job again (so a decline re-routes to the next best member).
"""
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.agency import TAKEN_STATUSES, Agency, AgencyMember, Assignment
from app.models.job import Job
from app.models.profile import Profile
from app.models.user import User
from app.services.matching import job_summary, nearest_jobs, score_job
from app.services.profiles import refresh_embedding
from app.services.skill_utils import canonical_set, canonical_skill

CANDIDATES_PER_MEMBER = 20


@dataclass
class TeamMember:
    user: User
    profile: Profile
    vector: np.ndarray


def team_members(db: Session, agency: Agency) -> list[TeamMember]:
    """Active members that have a profile with a ready embedding."""
    rows = db.execute(
        select(User, Profile)
        .join(AgencyMember, AgencyMember.user_id == User.id)
        .join(Profile, Profile.user_id == User.id)
        .where(AgencyMember.agency_id == agency.id, AgencyMember.status == "active")
        .order_by(User.full_name)
    ).all()
    team = []
    for user, profile in rows:
        if profile.embedding is None and refresh_embedding(profile):
            db.commit()
        if profile.embedding is not None:
            team.append(TeamMember(user, profile, np.asarray(profile.embedding, dtype=np.float32)))
    return team


def score_all_members(job: Job, team: list[TeamMember], now: datetime) -> list[dict[str, Any]]:
    """Every member's Match Score for one job, best first."""
    job_vec = np.asarray(job.embedding, dtype=np.float32)
    scored = []
    for m in team:
        cosine = float(m.vector @ job_vec)  # unit vectors -> dot product = cosine similarity
        result = score_job(m.profile, job, cosine, now)
        scored.append({
            "member_id": str(m.user.id),
            "name": m.user.full_name,
            "score": result["score"],
            "reason": result["reason"],
            "matched_skills": result["matched_skills"],
        })
    scored.sort(key=lambda s: s["score"], reverse=True)
    return scored


def team_missing_skills(job: Job, team: list[TeamMember]) -> list[str]:
    covered = set().union(*(canonical_set(m.profile.skills) for m in team)) if team else set()
    return [s for s in job.skills if canonical_skill(s) not in covered]


def _assignment_state(db: Session, agency_id: uuid.UUID) -> tuple[set[uuid.UUID], dict[uuid.UUID, set[str]]]:
    """(jobs already taken in this agency, {job_id: member ids who declined it})."""
    taken: set[uuid.UUID] = set()
    declined: dict[uuid.UUID, set[str]] = {}
    for job_id, member_id, status in db.execute(
        select(Assignment.job_id, Assignment.member_id, Assignment.status).where(Assignment.agency_id == agency_id)
    ):
        if status in TAKEN_STATUSES:
            taken.add(job_id)
        elif status == "declined":
            declined.setdefault(job_id, set()).add(str(member_id))
    return taken, declined


def recommend_for_job(job: Job, team: list[TeamMember], excluded: set[str], now: datetime) -> dict[str, Any] | None:
    eligible = [m for m in team if str(m.user.id) not in excluded]
    if not eligible or job.embedding is None:
        return None
    scores = score_all_members(job, eligible, now)
    best = scores[0]
    low_fit = best["score"] < settings.LOW_TEAM_FIT
    return {
        "job": job_summary(job),
        "recommended": best,
        "alternatives": scores[1:],
        "low_team_fit": low_fit,
        "missing_skills": team_missing_skills(job, team) if low_fit else [],
        "rerouted_after_decline": bool(excluded),
    }


def compute_routing(db: Session, agency: Agency, limit: int = 20) -> list[dict[str, Any]]:
    team = team_members(db, agency)
    if not team:
        return []
    taken, declined = _assignment_state(db, agency.id)

    # 1. Candidate jobs: union of each member's nearest jobs (manual jobs are private, so skipped)
    candidates: dict[uuid.UUID, Job] = {}
    for m in team:
        for job, _ in nearest_jobs(db, m.profile.embedding, m.user.id, CANDIDATES_PER_MEMBER):  # type: ignore[arg-type]
            if job.source != "manual" and job.id not in taken:
                candidates[job.id] = job

    # 2-3. Score every member for every candidate and pick the best
    now = datetime.now(timezone.utc)
    recs = []
    for job in candidates.values():
        rec = recommend_for_job(job, team, declined.get(job.id, set()), now)
        if rec:
            recs.append(rec)
    recs.sort(key=lambda r: r["recommended"]["score"], reverse=True)
    return recs[:limit]


def next_best_after_decline(db: Session, agency: Agency, job: Job) -> dict[str, Any] | None:
    """After a decline: recommend the best member who has not declined this job, and record it."""
    team = team_members(db, agency)
    _, declined = _assignment_state(db, agency.id)
    rec = recommend_for_job(job, team, declined.get(job.id, set()), datetime.now(timezone.utc))
    if rec is None:
        return None
    best = rec["recommended"]
    db.add(Assignment(agency_id=agency.id, job_id=job.id, member_id=uuid.UUID(best["member_id"]),
                      status="recommended", score=best["score"]))
    db.commit()
    return rec
