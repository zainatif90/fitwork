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
from app.models.agency import INVITE_VALID_DAYS, TAKEN_STATUSES, Agency, AgencyMember, Assignment
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


def agency_of(db: Session, user: User) -> Agency:
    """The agency this user owns or belongs to (403 for a solo freelancer)."""
    if user.role == "agency_owner":
        return get_or_create_agency(db, user)
    if user.role == "agency_member":
        return agency_of_member(db, user)[0]
    raise HTTPException(status_code=403, detail="This is for agency teams. Start or join an agency first.")


def invite_member(db: Session, agency: Agency, owner: User, email: str) -> tuple[AgencyMember, str, str]:
    """Create (or refresh) an invite. Returns the member row, the one-time token and the invite link."""
    email = email.lower()
    if email == owner.email:
        raise HTTPException(status_code=400, detail="You cannot invite yourself")
    existing_user = db.scalar(select(User).where(User.email == email))
    # One message for both cases, so an invite cannot be used to learn more about someone's account
    if existing_user and (existing_user.role == "agency_owner"
                          or db.scalar(select(AgencyMember).where(AgencyMember.user_id == existing_user.id))):
        raise HTTPException(status_code=409, detail="This person can't be invited because they are already part of an agency")

    member = db.scalar(select(AgencyMember).where(AgencyMember.agency_id == agency.id, AgencyMember.email == email))
    if member is None:
        member = AgencyMember(agency_id=agency.id, email=email, status="invited")
        db.add(member)
    token = new_random_token()
    member.invite_token_hash = hash_token(token)  # a new token replaces any older one
    member.invite_sent_at = datetime.now(timezone.utc)
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
    if invite_expired(row[0]):
        raise HTTPException(status_code=404, detail="This invite link has expired. Ask the agency owner to send a new one.")
    return row[0], row[1]


def invite_expired(member: AgencyMember) -> bool:
    sent = member.invite_sent_at or member.invited_at
    limit = datetime.now(timezone.utc) - timedelta(days=INVITE_VALID_DAYS)
    return member.status == "invited" and sent is not None and sent < limit


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
    _drop_member(db, agency, member)
    db.commit()


def leave_agency(db: Session, user: User) -> None:
    """A member leaves on their own; works exactly like the owner removing them."""
    agency, member = agency_of_member(db, user)
    _drop_member(db, agency, member)
    db.commit()


def close_agency(db: Session, owner: User, confirm_name: str) -> None:
    """
    The owner closes the agency for good: everyone goes back to being a solo freelancer and the team's
    assignments and chat are deleted (database cascade). Profiles and personal matches are kept.
    """
    agency = get_or_create_agency(db, owner)
    if confirm_name.strip() != agency.name.strip():
        raise HTTPException(status_code=400, detail="Type the agency name exactly to confirm")
    member_ids = list(db.scalars(select(AgencyMember.user_id).where(
        AgencyMember.agency_id == agency.id, AgencyMember.user_id.is_not(None))))
    for user in db.scalars(select(User).where(User.id.in_(member_ids))):
        user.role = "freelancer"
    owner.role = "freelancer"
    db.delete(agency)  # members, assignments, chat messages and read markers go with it (ON DELETE CASCADE)
    db.commit()


def detach_before_account_deletion(db: Session, user: User) -> None:
    """
    Called just before a user deletes their account, so the team they leave behind stays consistent:
    - an owner's agency is closed (members become solo freelancers, as with "Close agency");
    - a member leaves (their open jobs go back to routing, as with "Leave agency").
    The database cascade then removes everything that belonged to the user.
    """
    own = db.scalar(select(Agency).where(Agency.owner_id == user.id))
    if own is not None:
        member_ids = list(db.scalars(select(AgencyMember.user_id).where(
            AgencyMember.agency_id == own.id, AgencyMember.user_id.is_not(None))))
        for member in db.scalars(select(User).where(User.id.in_(member_ids))):
            member.role = "freelancer"
        db.delete(own)
    row = db.execute(select(Agency, AgencyMember).join(AgencyMember, AgencyMember.agency_id == Agency.id)
                     .where(AgencyMember.user_id == user.id, AgencyMember.status == "active")).first()
    if row is not None:
        _drop_member(db, row[0], row[1])
    db.flush()


def _drop_member(db: Session, agency: Agency, member: AgencyMember) -> None:
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


def list_members(db: Session, agency: Agency) -> list[dict[str, Any]]:
    rows = db.execute(
        select(AgencyMember, User).outerjoin(User, User.id == AgencyMember.user_id)
        .where(AgencyMember.agency_id == agency.id).order_by(AgencyMember.invited_at)
    ).all()
    return [{
        "id": str(m.id), "user_id": str(m.user_id) if m.user_id else None, "email": m.email,
        "name": u.full_name if u else None, "status": m.status,
        "invited_at": m.invite_sent_at or m.invited_at, "joined_at": m.joined_at,
        "invite_expired": invite_expired(m),
    } for m, u in rows]


def _week_start(d: datetime) -> datetime:
    return (d - timedelta(days=d.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def member_stats(db: Session, agency: Agency, weeks: int = 8, tz_minutes: int = 0) -> dict[str, Any]:
    """
    Team numbers for the owner. Everything is counted on the server from ALL of the agency's assignments
    (the page used to count a 100-row list, so totals were wrong for busy agencies).
    - members: active members, plus the owner when the owner has a profile (the owner can take jobs too)
    - results: assigned / applied / won / lost per person, including people who have left (history stays true)
    - totals: the same numbers for the whole agency
    "Today" and the weekly chart use the viewer's time zone (tz_minutes = minutes ahead of UTC).
    """
    now = datetime.now(timezone(timedelta(minutes=tz_minutes)))
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    owner = db.get(User, agency.owner_id)
    owner_profile = db.scalar(select(Profile).where(Profile.user_id == agency.owner_id))
    members = db.execute(
        select(User, Profile).join(AgencyMember, AgencyMember.user_id == User.id)
        .outerjoin(Profile, Profile.user_id == User.id)
        .where(AgencyMember.agency_id == agency.id, AgencyMember.status == "active")
        .order_by(User.full_name)
    ).all()
    people = ([(owner, owner_profile)] if owner and owner_profile else []) + [(u, p) for u, p in members]
    assignments = list(db.scalars(select(Assignment).where(Assignment.agency_id == agency.id)))

    team = []
    first_week = _week_start(now) - timedelta(weeks=weeks - 1)
    week_starts = [first_week + timedelta(weeks=i) for i in range(weeks)]
    series: dict[str, dict[str, float | None]] = {w.date().isoformat(): {} for w in week_starts}

    for user, profile in people:
        mine = [a for a in assignments if a.member_id == user.id]
        recent_outcomes = [a for a in mine if a.status in ("won", "lost") and a.updated_at >= now - timedelta(days=30)]
        won_30 = sum(1 for a in recent_outcomes if a.status == "won")
        team.append({
            "member_id": str(user.id),
            "name": user.full_name,
            "email": user.email,
            "is_owner": user.id == agency.owner_id,
            "top_skills": (profile.skills[:5] if profile else []),
            "has_profile": profile is not None,
            "active_assignments": sum(1 for a in mine if a.status in ("assigned", "applied")),
            "win_rate_30d": round(won_30 / len(recent_outcomes), 2) if recent_outcomes else None,
            "decided_30d": len(recent_outcomes),
            "routed_today": sum(1 for a in mine if a.status in TAKEN_STATUSES and a.created_at >= today),
        })
        for start in week_starts:
            in_week = [a for a in mine if a.status in ("won", "lost") and start <= a.updated_at < start + timedelta(weeks=1)]
            series[start.date().isoformat()][str(user.id)] = (
                round(sum(1 for a in in_week if a.status == "won") / len(in_week), 2) if in_week else None
            )

    # Results per person, also for people who have left the agency (their history still counts)
    current = {u.id for u, _ in people}
    ids = {a.member_id for a in assignments if a.status in TAKEN_STATUSES} | current
    names = {u.id: u.full_name for u in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}
    results = []
    for uid in sorted(ids, key=lambda i: names.get(i, "").lower()):
        mine = [a for a in assignments if a.member_id == uid]
        results.append({
            "member_id": str(uid), "name": names.get(uid, "Former member"), "current": uid in current,
            "assigned": sum(1 for a in mine if a.status in TAKEN_STATUSES),
            "applied": sum(1 for a in mine if a.status == "applied"),
            "won": sum(1 for a in mine if a.status == "won"),
            "lost": sum(1 for a in mine if a.status == "lost"),
        })
    totals = {s: sum(1 for a in assignments if a.status == s) for s in ("assigned", "applied", "won", "lost", "declined")}

    return {
        "members": team,
        "results": results,
        "totals": totals,
        "win_rate_series": [{"week": w, **series[w]} for w in series],
        "has_outcomes": any(a.status in ("won", "lost") for a in assignments),
    }
