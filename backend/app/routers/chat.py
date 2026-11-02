"""
Team chat endpoints (agency owners and members only). See app/services/chat.py for the access rules.

The website asks for new messages every few seconds ("polling") instead of keeping a WebSocket open:
simpler to explain, and it works on the free Render plan where the server can restart at any time.
"""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis_client import hit_rate_limit
from app.models.user import User
from app.services import chat

router = APIRouter(prefix="/agency/chat", tags=["team chat"])

MESSAGES_PER_MINUTE = 30
CALLS_PER_HOUR = 10


class ChannelOut(BaseModel):
    key: str  # "team", "job-<job id>" or "dm-<user id>"
    kind: Literal["team", "job", "direct"]
    title: str
    subtitle: str
    member_id: str | None  # the other person, for direct chats
    unread: int
    last_message: str | None
    last_at: datetime | None


class ChannelsOut(BaseModel):
    me: str
    channels: list[ChannelOut]
    unread_total: int


class MessageOut(BaseModel):
    id: str
    sender_id: str | None
    sender_name: str
    kind: Literal["text", "call"]
    body: str
    created_at: datetime


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty")
        return v


class UnreadOut(BaseModel):
    unread: int


@router.get("/channels", response_model=ChannelsOut)
def channels(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    items = chat.list_channels(db, chat.agency_for(db, user), user)
    return {"me": str(user.id), "channels": items, "unread_total": sum(c["unread"] for c in items)}


@router.get("/unread", response_model=UnreadOut)
def unread(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Small call for the sidebar badge. Freelancers without an agency simply get 0."""
    return {"unread": chat.unread_total(db, user)}


@router.get("/channels/{key}/messages", response_model=list[MessageOut])
def messages(key: str, after: datetime | None = Query(default=None), user: User = Depends(get_current_user),
             db: Session = Depends(get_db)) -> list[dict]:
    agency = chat.agency_for(db, user)
    return chat.get_messages(db, agency, user, chat.resolve(db, agency, user, key), after)


@router.post("/channels/{key}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def send(key: str, data: MessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    agency = chat.agency_for(db, user)
    channel = chat.resolve(db, agency, user, key)
    if hit_rate_limit(f"rl:chat:{user.id}", MESSAGES_PER_MINUTE, 60):
        raise HTTPException(status_code=429, detail="You are sending messages too fast. Please wait a moment.")
    return chat.post_message(db, agency, user, channel, data.body)


@router.post("/channels/{key}/call", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def start_call(key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Posts a 'call' message with a fresh Jitsi Meet link; everyone in the chat can join from it."""
    agency = chat.agency_for(db, user)
    channel = chat.resolve(db, agency, user, key)
    if hit_rate_limit(f"rl:call:{user.id}", CALLS_PER_HOUR, 3600):
        raise HTTPException(status_code=429, detail=f"You can start up to {CALLS_PER_HOUR} calls an hour.")
    return chat.post_message(db, agency, user, channel, chat.new_call_link(), kind="call")
