"""
Agency Mode endpoints (UC-4).

Role rules (enforced here, not only in the UI):
- Only the agency owner can invite, see routing, assign or override, and see team stats.
- A member only sees and acts on their own job queue.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.redis_client import hit_rate_limit
from app.models.agency import TAKEN_STATUSES, Agency, AgencyMember, Assignment
from app.models.job import Job
from app.models.user import User
from app.schemas.agency import (
    AgencyOut,
    AgencyRenameIn,
    AssignIn,
    AssignmentOut,
    AssignmentStatusIn,
    DeclineOut,
    InviteIn,
    InviteInfoOut,
    InviteOut,
    InviteTokenIn,
    MemberRow,
    RoutingRecommendation,
    TeamStatsOut,
)
from app.services import agency as agency_service
from app.services import email as email_service
from app.services.matching import job_summary, score_single_job
from app.services.profiles import get_profile
from app.services.routing import compute_routing, next_best_after_decline

router = APIRouter(prefix="/agency", tags=["agency"])

owner_only = require_roles("agency_owner")
member_only = require_roles("agency_member")

# Status changes a member may make (forward only; won and lost are final)
NEXT_STATUSES: dict[str, tuple[str, ...]] = {"assigned": ("applied", "won", "lost"), "applied": ("won", "lost")}


def _assignment_out(db: Session, a: Assignment) -> dict[str, Any]:
    job = db.get(Job, a.job_id)
    member = db.get(User, a.member_id)
    return {
        "id": str(a.id), "job": job_summary(job), "member_id": str(a.member_id),  # type: ignore[arg-type]
        "member_name": member.full_name if member else "Former member",
        "status": a.status, "score": a.score, "created_at": a.created_at, "updated_at": a.updated_at,
    }


# ---------- Agency + invites ----------

@router.get("/me", response_model=AgencyOut)
def my_agency(user: User = Depends(require_roles("agency_owner", "agency_member")), db: Session = Depends(get_db)) -> dict:
    if user.role == "agency_owner":
        agency = agency_service.get_or_create_agency(db, user)
        return {"id": str(agency.id), "name": agency.name, "role": "owner", "owner_name": user.full_name,
                "members": agency_service.list_members(db, agency)}
    agency, _ = agency_service.agency_of_member(db, user)
    owner = db.get(User, agency.owner_id)
    return {"id": str(agency.id), "name": agency.name, "role": "member", "owner_name": owner.full_name if owner else ""}


@router.post("/start", response_model=AgencyOut, status_code=status.HTTP_201_CREATED)
def start_agency(user: User = Depends(require_roles("freelancer")), db: Session = Depends(get_db)) -> dict:
    # A solo freelancer can turn their account into an agency owner later (the role is not only a sign-up choice).
    # Their profile and personal matches stay as they are.
    if db.scalar(select(AgencyMember).where(AgencyMember.user_id == user.id, AgencyMember.status == "active")):
        raise HTTPException(status_code=409, detail="You are already in an agency")
    user.role = "agency_owner"
    db.commit()
    agency = agency_service.get_or_create_agency(db, user)
    return {"id": str(agency.id), "name": agency.name, "role": "owner", "owner_name": user.full_name,
            "members": agency_service.list_members(db, agency)}


@router.put("/me", response_model=AgencyOut)
def rename_agency(data: AgencyRenameIn, user: User = Depends(owner_only), db: Session = Depends(get_db)) -> dict:
    agency = agency_service.get_or_create_agency(db, user)
    agency.name = data.name.strip()
    db.commit()
    return {"id": str(agency.id), "name": agency.name, "role": "owner", "owner_name": user.full_name,
            "members": agency_service.list_members(db, agency)}


INVITES_PER_DAY = 10


@router.post("/invite", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
def invite(data: InviteIn, user: User = Depends(owner_only), db: Session = Depends(get_db)) -> dict:
    # Invites are emails sent from our address: only verified owners, and at most 10 a day
    # (otherwise anyone could sign up and use our mail quota to email strangers).
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email address before inviting team members.")
    if hit_rate_limit(f"rl:invite:{user.id}", INVITES_PER_DAY, 24 * 3600):
        raise HTTPException(status_code=429, detail=f"You can send up to {INVITES_PER_DAY} invites a day. Please try again tomorrow.")
    agency = agency_service.get_or_create_agency(db, user)
    member, token, link = agency_service.invite_member(db, agency, user, data.email)
    row = next(m for m in agency_service.list_members(db, agency) if m["id"] == str(member.id))
    return {"member": MemberRow(**row), "invite_link": link, "invite_token": token,
            "email_sent": email_service.mailer_configured()}


@router.get("/invite/{token}", response_model=InviteInfoOut)
def invite_info(token: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    member, agency = agency_service.find_invite(db, token)
    return {"agency_name": agency.name, "invited_email": member.email}


@router.post("/invite/accept", response_model=AgencyOut)
def accept(data: InviteTokenIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    agency = agency_service.accept_invite(db, user, data.token)
    owner = db.get(User, agency.owner_id)
    return {"id": str(agency.id), "name": agency.name, "role": "member", "owner_name": owner.full_name if owner else ""}


@router.delete("/members/{member_row_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove(member_row_id: uuid.UUID, user: User = Depends(owner_only), db: Session = Depends(get_db)) -> None:
    agency_service.remove_member(db, agency_service.get_or_create_agency(db, user), member_row_id)


# ---------- Routing (owner) ----------

@router.get("/routing", response_model=list[RoutingRecommendation])
def routing(user: User = Depends(owner_only), db: Session = Depends(get_db)) -> list[dict]:
    return compute_routing(db, agency_service.get_or_create_agency(db, user))


@router.post("/assign", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
def assign(data: AssignIn, user: User = Depends(owner_only), db: Session = Depends(get_db)) -> dict:
    """Approve the recommendation or override it by choosing another member."""
    agency = agency_service.get_or_create_agency(db, user)
    is_member = db.scalar(select(AgencyMember).where(
        AgencyMember.agency_id == agency.id, AgencyMember.user_id == data.member_id, AgencyMember.status == "active"))
    if not is_member:
        raise HTTPException(status_code=400, detail="That person is not an active member of your agency")
    job = db.get(Job, data.job_id)
    if job is None or job.source == "manual":
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.is_active:
        raise HTTPException(status_code=400, detail="This job has expired and can no longer be assigned")
    if db.scalar(select(Assignment).where(Assignment.agency_id == agency.id, Assignment.job_id == job.id,
                                          Assignment.status.in_(TAKEN_STATUSES))):
        raise HTTPException(status_code=409, detail="This job is already assigned in your agency")

    profile = get_profile(db, data.member_id)
    score = (score_single_job(db, profile, job) or {}).get("score") if profile else None
    # Reuse a pending "recommended" row for this member if one exists (created after a decline)
    assignment = db.scalar(select(Assignment).where(
        Assignment.agency_id == agency.id, Assignment.job_id == job.id,
        Assignment.member_id == data.member_id, Assignment.status == "recommended"))
    if assignment is None:
        assignment = Assignment(agency_id=agency.id, job_id=job.id, member_id=data.member_id)
        db.add(assignment)
    assignment.status = "assigned"
    assignment.score = score
    assignment.assigned_by = user.id
    db.commit()
    db.refresh(assignment)
    return _assignment_out(db, assignment)


@router.get("/assignments", response_model=list[AssignmentOut])
def all_assignments(user: User = Depends(owner_only), db: Session = Depends(get_db)) -> list[dict]:
    agency = agency_service.get_or_create_agency(db, user)
    rows = db.scalars(select(Assignment).where(Assignment.agency_id == agency.id, Assignment.status != "recommended")
                      .order_by(Assignment.updated_at.desc()).limit(100))
    return [_assignment_out(db, a) for a in rows]


@router.get("/members/stats", response_model=TeamStatsOut)
def stats(user: User = Depends(owner_only), db: Session = Depends(get_db)) -> dict:
    return agency_service.member_stats(db, agency_service.get_or_create_agency(db, user))


# ---------- Member queue ----------

def _my_assignment(db: Session, user: User, assignment_id: uuid.UUID) -> tuple[Assignment, Agency]:
    agency, _ = agency_service.agency_of_member(db, user)
    a = db.get(Assignment, assignment_id)
    if a is None or a.member_id != user.id or a.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return a, agency


@router.get("/queue", response_model=list[AssignmentOut])
def my_queue(user: User = Depends(member_only), db: Session = Depends(get_db)) -> list[dict]:
    agency, _ = agency_service.agency_of_member(db, user)
    rows = db.scalars(select(Assignment).where(
        Assignment.agency_id == agency.id, Assignment.member_id == user.id,
        Assignment.status.in_(TAKEN_STATUSES)).order_by(Assignment.updated_at.desc()))
    return [_assignment_out(db, a) for a in rows]


@router.post("/assignments/{assignment_id}/decline", response_model=DeclineOut)
def decline(assignment_id: uuid.UUID, user: User = Depends(member_only), db: Session = Depends(get_db)) -> dict:
    a, agency = _my_assignment(db, user, assignment_id)
    if a.status not in ("assigned", "recommended"):
        raise HTTPException(status_code=400, detail=f"You cannot decline a job that is already '{a.status}'")
    a.status = "declined"
    db.commit()
    job = db.get(Job, a.job_id)
    nxt = next_best_after_decline(db, agency, job) if job else None  # re-route to the next best member
    return {"declined": _assignment_out(db, a), "next_recommendation": nxt}


@router.post("/assignments/{assignment_id}/status", response_model=AssignmentOut)
def update_status(assignment_id: uuid.UUID, data: AssignmentStatusIn, user: User = Depends(member_only),
                  db: Session = Depends(get_db)) -> dict:
    a, _ = _my_assignment(db, user, assignment_id)
    # Only forward moves: assigned -> applied -> won/lost. A final result cannot be changed later,
    # otherwise past win rates would change.
    allowed = NEXT_STATUSES.get(a.status, ())
    if data.status != a.status and data.status not in allowed:
        raise HTTPException(status_code=400, detail=f"A job that is '{a.status}' cannot be changed to '{data.status}'")
    a.status = data.status
    db.commit()
    db.refresh(a)
    return _assignment_out(db, a)
