import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

ASSIGNMENT_STATUSES = ("recommended", "assigned", "declined", "applied", "won", "lost")
# An assignment in one of these states means the job is "taken" inside the agency
TAKEN_STATUSES = ("assigned", "applied", "won", "lost")


class Agency(Base):
    __tablename__ = "agencies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AgencyMember(Base):
    """A team member. Starts as an invite (status=invited, user_id empty) and becomes active on accept."""

    __tablename__ = "agency_members"
    __table_args__ = (CheckConstraint("status IN ('invited', 'active')", name="ck_agency_members_status"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=True)
    email: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(10), default="invited")
    # We store only a SHA-256 hash of the invite token, never the token itself
    invite_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Assignment(Base):
    """A job routed to a member: recommended -> assigned -> applied -> won / lost (or declined)."""

    __tablename__ = "assignments"
    __table_args__ = (CheckConstraint(f"status IN {ASSIGNMENT_STATUSES}", name="ck_assignments_status"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(12))
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # member's Match Score for the job
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
