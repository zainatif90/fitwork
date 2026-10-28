import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.core.database import Base
from app.models.user import User

EXPERIENCE_LEVELS = ("beginner", "intermediate", "expert")


class Profile(Base):
    """A freelancer's skill profile. One per user."""

    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint(f"experience_level IN {EXPERIENCE_LEVELS}", name="ck_profiles_experience"),
        CheckConstraint("embedding_status IN ('ready', 'pending')", name="ck_profiles_embedding_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    skills: Mapped[list[str]] = mapped_column(ARRAY(String(60)), default=list)
    experience_level: Mapped[str] = mapped_column(String(20))
    hourly_rate: Mapped[float] = mapped_column(Float)  # USD per hour
    bio: Mapped[str] = mapped_column(Text, default="")
    portfolio_urls: Mapped[list[str]] = mapped_column(ARRAY(String(500)), default=list)
    platforms: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    # 384 numbers from all-MiniLM-L6-v2; NULL while embedding_status = 'pending'
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.EMBEDDING_DIM), nullable=True)
    embedding_status: Mapped[str] = mapped_column(String(10), default="pending")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship()
