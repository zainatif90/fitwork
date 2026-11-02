"""
Team chat for agencies (an extra feature beyond the SRS).

Who can see what (checked on every request, never only in the UI):
- "team" channel: the owner and every active member.
- a job thread: the owner and the member(s) the job is assigned to.
- a direct chat: only the two people in it, and both must be in the same agency.
A channel the user may not open answers 404, so nobody can find out that it exists.

Calls: the server makes a random Jitsi Meet room link (free, open source, nothing to install).
The browser opens it in a new tab; FitWork itself never handles audio or video.
"""
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.agency import TAKEN_STATUSES, Agency, AgencyMember, Assignment
from app.models.chat import ChatMessage, ChatRead
from app.models.job import Job
from app.models.user import User
from app.services import agency as agency_service

JITSI_BASE = "https://meet.jit.si"
PAGE_SIZE = 50


def agency_for(db: Session, user: User) -> Agency:
    if user.role == "agency_owner":
        return agency_service.get_or_create_agency(db, user)
    if user.role == "agency_member":
        return agency_service.agency_of_member(db, user)[0]
    raise HTTPException(status_code=403, detail="Team chat is for agency teams. Start or join an agency first.")


def people(db: Session, agency: Agency) -> dict[uuid.UUID, User]:
    """Everyone in the agency: the owner and the active members."""
    member_ids = select(AgencyMember.user_id).where(AgencyMember.agency_id == agency.id, AgencyMember.status == "active")
    users = db.scalars(select(User).where(or_(User.id == agency.owner_id, User.id.in_(member_ids))))
    return {u.id: u for u in users}


def _dm_channel(a: uuid.UUID, b: uuid.UUID) -> str:
    low, high = sorted([str(a), str(b)])
    return f"dm:{low}:{high}"


def _job_assignees(db: Session, agency: Agency, job_id: uuid.UUID) -> list[uuid.UUID]:
    return list(db.scalars(select(Assignment.member_id).where(
        Assignment.agency_id == agency.id, Assignment.job_id == job_id, Assignment.status.in_(TAKEN_STATUSES))))


def resolve(db: Session, agency: Agency, user: User, key: str) -> str:
    """
    Turn a key from the URL ("team", "job-<job id>", "dm-<other user id>") into the stored channel name,
    after checking that this user may open it.
    """
    not_found = HTTPException(status_code=404, detail="Chat not found")
    if key == "team":
        return "team"
    kind, _, raw = key.partition("-")
    try:
        ref = uuid.UUID(raw)
    except ValueError:
        raise not_found from None
    if kind == "job":
        assignees = _job_assignees(db, agency, ref)
        if not assignees or (user.id != agency.owner_id and user.id not in assignees):
            raise not_found
        return f"job:{ref}"
    if kind == "dm":
        if ref == user.id or ref not in people(db, agency):
            raise not_found
        return _dm_channel(user.id, ref)
    raise not_found


def _unread_and_last(db: Session, agency: Agency, user: User, channels: list[str]) -> tuple[dict[str, int], dict[str, ChatMessage]]:
    read = and_(ChatRead.user_id == user.id, ChatRead.agency_id == agency.id, ChatRead.channel == ChatMessage.channel)
    unread_rows = db.execute(
        select(ChatMessage.channel, func.count())
        .outerjoin(ChatRead, read)
        .where(ChatMessage.agency_id == agency.id, ChatMessage.channel.in_(channels),
               or_(ChatMessage.sender_id.is_(None), ChatMessage.sender_id != user.id),
               or_(ChatRead.last_read_at.is_(None), ChatMessage.created_at > ChatRead.last_read_at))
        .group_by(ChatMessage.channel)
    ).all()
    # Postgres DISTINCT ON: the newest message of each channel
    last = db.scalars(
        select(ChatMessage).where(ChatMessage.agency_id == agency.id, ChatMessage.channel.in_(channels))
        .distinct(ChatMessage.channel).order_by(ChatMessage.channel, ChatMessage.created_at.desc())
    )
    return {c: n for c, n in unread_rows}, {m.channel: m for m in last}


def _preview(m: ChatMessage, names: dict[uuid.UUID, str], user: User) -> str:
    who = "You" if m.sender_id == user.id else names.get(m.sender_id, "Someone").split(" ")[0]  # type: ignore[arg-type]
    text = "started a video call" if m.kind == "call" else m.body
    return f"{who}: {text}"[:90]


def list_channels(db: Session, agency: Agency, user: User) -> list[dict[str, Any]]:
    team = people(db, agency)
    names = {uid: u.full_name for uid, u in team.items()}
    is_owner = user.id == agency.owner_id
    channels: list[dict[str, Any]] = [{
        "key": "team", "channel": "team", "kind": "team", "title": agency.name,
        "subtitle": f"Everyone · {len(team)} people", "member_id": None,
    }]

    q = (select(Assignment, Job).join(Job, Job.id == Assignment.job_id)
         .where(Assignment.agency_id == agency.id, Assignment.status.in_(TAKEN_STATUSES))
         .order_by(Assignment.updated_at.desc()))
    if not is_owner:
        q = q.where(Assignment.member_id == user.id)
    seen: set[uuid.UUID] = set()
    for a, job in db.execute(q):
        if job.id in seen:
            continue
        seen.add(job.id)
        channels.append({
            "key": f"job-{job.id}", "channel": f"job:{job.id}", "kind": "job", "title": job.title,
            "subtitle": f"{names.get(a.member_id, 'Former member')} · {a.status}", "member_id": None,
        })

    for uid, u in sorted(team.items(), key=lambda kv: kv[1].full_name.lower()):
        if uid == user.id:
            continue
        channels.append({
            "key": f"dm-{uid}", "channel": _dm_channel(user.id, uid), "kind": "direct", "title": u.full_name,
            "subtitle": "Agency owner" if uid == agency.owner_id else "Team member", "member_id": str(uid),
        })

    unread, last = _unread_and_last(db, agency, user, [c["channel"] for c in channels])
    for c in channels:
        name = c.pop("channel")  # stored channel name stays on the server; the browser uses "key"
        m = last.get(name)
        c["unread"] = unread.get(name, 0)
        c["last_message"] = _preview(m, names, user) if m else None
        c["last_at"] = m.created_at if m else None
    return channels


def unread_total(db: Session, user: User) -> int:
    if user.role not in ("agency_owner", "agency_member"):
        return 0
    return sum(c["unread"] for c in list_channels(db, agency_for(db, user), user))


def message_out(m: ChatMessage, names: dict[uuid.UUID, str]) -> dict[str, Any]:
    return {
        "id": str(m.id), "sender_id": str(m.sender_id) if m.sender_id else None,
        "sender_name": names.get(m.sender_id, "Former member") if m.sender_id else "FitWork",  # type: ignore[arg-type]
        "kind": m.kind, "body": m.body, "created_at": m.created_at,
    }


def _names(db: Session, ids: set[uuid.UUID | None]) -> dict[uuid.UUID, str]:
    real = {i for i in ids if i}
    return {u.id: u.full_name for u in db.scalars(select(User).where(User.id.in_(real)))} if real else {}


def get_messages(db: Session, agency: Agency, user: User, channel: str, after: datetime | None) -> list[dict[str, Any]]:
    q = select(ChatMessage).where(ChatMessage.agency_id == agency.id, ChatMessage.channel == channel)
    if after is not None:
        rows = list(db.scalars(q.where(ChatMessage.created_at > after).order_by(ChatMessage.created_at).limit(PAGE_SIZE)))
    else:
        rows = list(reversed(list(db.scalars(q.order_by(ChatMessage.created_at.desc()).limit(PAGE_SIZE)))))
    mark_read(db, agency, user, channel)
    names = _names(db, {m.sender_id for m in rows})
    return [message_out(m, names) for m in rows]


def mark_read(db: Session, agency: Agency, user: User, channel: str) -> None:
    now = datetime.now(timezone.utc)
    db.execute(insert(ChatRead).values(user_id=user.id, agency_id=agency.id, channel=channel, last_read_at=now)
               .on_conflict_do_update(index_elements=["user_id", "agency_id", "channel"], set_={"last_read_at": now}))
    db.commit()


def post_message(db: Session, agency: Agency, user: User, channel: str, body: str, kind: str = "text") -> dict[str, Any]:
    m = ChatMessage(agency_id=agency.id, channel=channel, sender_id=user.id, kind=kind, body=body)
    db.add(m)
    db.commit()
    db.refresh(m)
    mark_read(db, agency, user, channel)  # your own message is never "unread" for you
    return message_out(m, {user.id: user.full_name})


def new_call_link() -> str:
    # Random, unguessable room name, so only people who see the link can join
    return f"{JITSI_BASE}/FitWork-{secrets.token_hex(10)}"
