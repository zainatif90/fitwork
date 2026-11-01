"""Agency membership: create agency, invite flow, member stats."""
import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import new_random_token
from app.models.agency import Agency, AgencyMember, Assignment
from app.models.profile import Profile
from app.models.user import User
from app.services import email as email_service

log = logging.getLogger(__name__)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_or_create_agency(db: Session, owner: User) -> Agency:
    agency = db.scalar(select(Agency).where(Agency.owner_id == owner.id))
    if agency is None:
        agency = Agency(owner_id=owner.id, name=f"{owner.full_name}'s Agency")
        db.add(agency)
        db.commit()
        db.refresh(agency)
    return agency


def agency_of_member(db: Session, user: User) -> tuple[Agency, AgencyMember]:
    row = db.execute(
        select(Agency, AgencyMember).join(AgencyMember, AgencyMember.agency_id == Agency.id)
        .where(AgencyMember.user_id == user.id, AgencyMember.status == "active")
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="You are not in an agency")
    return row[0], row[1]


def invite_member(db: Session, agency: Agency, owner: User, email: str) -> tuple[AgencyMember, str, str]:
    """Create (or refresh) an invite. Returns the member row, the one-time token and the invite link."""
    email = email.lower()
    if email == owner.email:
        raise HTTPException(status_code=400, detail="You cannot invite yourself")
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user and existing_user.role == "agency_owner":
        raise HTTPException(status_code=400, detail="That person owns an agency and cannot join another one")
    if existing_user and db.scalar(select(AgencyMember).where(AgencyMember.user_id == existing_user.id)):
        raise HTTPException(status_code=409, detail="That person is already a member of an agency")

    member = db.scalar(select(AgencyMember).where(AgencyMember.agency_id == agency.id, AgencyMember.email == email))
    if member is None:
        member = AgencyMember(agency_id=agency.id, email=email, status="invited")
        db.add(member)
    token = new_random_token()
    member.invite_token_hash = hash_token(token)  # a new token replaces any older one
    db.commit()
    db.refresh(member)

    link = f"{settings.FRONTEND_URL}/invite/{token}"
    email_service.send_agency_invite(email, agency.name, owner.full_name, link)
    return member, token, link


def find_invite(db: Session, token: str) -> tuple[AgencyMember, Agency]:
    row = db.execute(
        select(AgencyMember, Agency).join(Agency, Agency.id == AgencyMember.agency_id)
        .where(AgencyMember.invite_token_hash == hash_token(token), AgencyMember.status == "invited")
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="This invite link is invalid or has already been used")
    return row[0], row[1]


def accept_invite(db: Session, user: User, token: str) -> Agency:
    member, agency = find_invite(db, token)
    if member.email != user.email:
        raise HTTPException(status_code=403, detail=f"This invite was sent to {member.email}. Log in with that email to accept it.")
    if user.role == "agency_owner":
        raise HTTPException(status_code=400, detail="Agency owners cannot join another agency")
    if db.scalar(select(AgencyMember).where(AgencyMember.user_id == user.id)):
        raise HTTPException(status_code=409, detail="You are already in an agency")
    member.user_id = user.id
    member.status = "active"
    member.invite_token_hash = None  # one-time use
    member.joined_at = datetime.now(timezone.utc)
    user.role = "agency_member"
    db.commit()
    return agency


def remove_member(db: Session, agency: Agency, member_row_id: uuid.UUID) -> None:
    member = db.get(AgencyMember, member_row_id)
    if member is None or member.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.user_id:
        user = db.get(User, member.user_id)
        if user:
            user.role = "freelancer"
        # Their open jobs go back to routing so the owner can give them to someone else.
        # Won/lost results are kept for the team's history.
        db.execute(delete(Assignment).where(
            Assignment.agency_id == agency.id, Assignment.member_id == member.user_id,
            Assignment.status.in_(("recommended", "assigned", "applied"))))
    db.delete(member)
    db.commit()


def list_members(db: Session, agency: Agency) -> list[dict[str, Any]]:
    rows = db.execute(
        select(AgencyMember, User).outerjoin(User, User.id == AgencyMember.user_id)
        .where(AgencyMember.agency_id == agency.id).order_by(AgencyMember.invited_at)
    ).all()
    return [{
        "id": str(m.id), "user_id": str(m.user_id) if m.user_id else None, "email": m.email,
        "name": u.full_name if u else None, "status": m.status,
        "invited_at": m.invited_at, "joined_at": m.joined_at,
    } for m, u in rows]


def _week_start(d: datetime) -> datetime:
    d = d.astimezone(timezone.utc)
    return (d - timedelta(days=d.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def member_stats(db: Session, agency: Agency, weeks: int = 8) -> dict[str, Any]:
    """Team table + weekly win-rate series for the line chart. Only real assignment outcomes are used."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    members = db.execute(
        select(User, Profile).join(AgencyMember, AgencyMember.user_id == User.id)
        .outerjoin(Profile, Profile.user_id == User.id)
        .where(AgencyMember.agency_id == agency.id, AgencyMember.status == "active")
        .order_by(User.full_name)
    ).all()
    assignments = list(db.scalars(select(Assignment).where(Assignment.agency_id == agency.id)))

    team = []
    first_week = _week_start(now) - timedelta(weeks=weeks - 1)
    week_keys = [(first_week + timedelta(weeks=i)).date().isoformat() for i in range(weeks)]
    series: dict[str, dict[str, float | None]] = {w: {} for w in week_keys}

    for user, profile in members:
        mine = [a for a in assignments if a.member_id == user.id]
        recent_outcomes = [a for a in mine if a.status in ("won", "lost") and a.updated_at >= now - timedelta(days=30)]
        won_30 = sum(1 for a in recent_outcomes if a.status == "won")
        team.append({
            "member_id": str(user.id),
            "name": user.full_name,
            "email": user.email,
            "top_skills": (profile.skills[:5] if profile else []),
            "has_profile": profile is not None,
            "active_assignments": sum(1 for a in mine if a.status in ("assigned", "applied")),
            "win_rate_30d": round(won_30 / len(recent_outcomes), 2) if recent_outcomes else None,
            "decided_30d": len(recent_outcomes),
            "routed_today": sum(1 for a in mine if a.status != "recommended" and a.created_at >= today),
        })
        for w in week_keys:
            start = datetime.fromisoformat(w).replace(tzinfo=timezone.utc)
            in_week = [a for a in mine if a.status in ("won", "lost") and start <= a.updated_at < start + timedelta(weeks=1)]
            series[w][str(user.id)] = (
                round(sum(1 for a in in_week if a.status == "won") / len(in_week), 2) if in_week else None
            )

    return {
        "members": team,
        "win_rate_series": [{"week": w, **series[w]} for w in week_keys],
        "has_outcomes": any(a.status in ("won", "lost") for a in assignments),
    }
