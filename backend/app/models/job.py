import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.core.database import Base

JOB_SOURCES = ("freelancer", "upwork", "csv", "manual", "synthetic")
LIVE_SOURCES = ("freelancer", "upwork")  # these expire after 72h; csv/manual never auto-expire


class Job(Base):
    """A freelance job listing, normalized from any source. Budgets are stored in USD."""

    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_jobs_source_external_id"),
        CheckConstraint(f"source IN {JOB_SOURCES}", name="ck_jobs_source"),
        CheckConstraint("budget_type IN ('fixed', 'hourly')", name="ck_jobs_budget_type"),
        # HNSW index: approximate nearest-neighbour search on cosine distance (fast top-k).
        Index(
            "ix_jobs_embedding_hnsw", "embedding",
            postgresql_using="hnsw", postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index("ix_jobs_active_posted", "is_active", "posted_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(20))
    external_id: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    skills: Mapped[list[str]] = mapped_column(ARRAY(String(80)), default=list)
    budget_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    budget_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    budget_type: Mapped[str] = mapped_column(String(10), default="fixed")
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    client_country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    client_hire_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    proposals_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.EMBEDDING_DIM), nullable=True)
    # Manual jobs are private to the user who pasted them
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
