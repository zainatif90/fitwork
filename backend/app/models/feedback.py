import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

OUTCOMES = ("applied", "won", "lost", "not_relevant")


class MatchFeedback(Base):
    """
    What happened after we showed a match. This is the labelled data a future
    win-probability model could be trained on (we do NOT train one now).
    """

    __tablename__ = "match_feedback"
    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="uq_feedback_user_job"),
        CheckConstraint(f"outcome IN {OUTCOMES}", name="ck_feedback_outcome"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    outcome: Mapped[str] = mapped_column(String(20))
    score_at_feedback: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Match Score when feedback was given
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
