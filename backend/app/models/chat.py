"""
Team chat inside an agency.

A message belongs to one channel of one agency. Channel keys:
  "team"               the whole agency (owner + active members)
  "job:<job uuid>"     a thread about one assigned job (owner + whoever the job is assigned to)
  "dm:<uuid>:<uuid>"   a private chat between two people (the two user ids, smaller one first)
"""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

MESSAGE_KINDS = ("text", "call")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint(f"kind IN {MESSAGE_KINDS}", name="ck_chat_messages_kind"),
        Index("ix_chat_messages_channel_time", "agency_id", "channel", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"))
    channel: Mapped[str] = mapped_column(String(80))
    sender_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(8), default="text")  # "call" = a video call link made by the server
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatRead(Base):
    """When a user last opened a channel, so we can count unread messages."""

    __tablename__ = "chat_reads"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), primary_key=True)
    channel: Mapped[str] = mapped_column(String(80), primary_key=True)
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
