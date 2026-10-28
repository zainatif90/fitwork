import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Proposal(Base):
    """History of generated proposal drafts."""

    __tablename__ = "proposals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    tone: Mapped[str] = mapped_column(String(20))
    length: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    is_fallback: Mapped[bool] = mapped_column(Boolean, default=False)  # True = template, LLM was unavailable
    provider: Mapped[str] = mapped_column(String(20))  # gemini | openai | template
    model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
