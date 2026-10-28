import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

ROLES = ("freelancer", "agency_owner", "agency_member")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(f"role IN {ROLES}", name="ck_users_role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)  # always stored lowercase
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="freelancer")
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)  # can trigger ingestion manually
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
