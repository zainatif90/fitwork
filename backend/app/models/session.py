import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuthSession(Base):
    """
    One logged-in device. Access and refresh tokens carry the session id (`sid`), so the server can
    end a session at once: logout revokes this device's session, a password reset revokes all of them.

    Refresh tokens are rotated: each refresh issues a new token id (jti) and the old one stops working.
    `previous_jti` is still accepted for a few seconds, because two browser tabs may refresh at the
    same moment; any older token is treated as stolen and the whole session is revoked.
    """

    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_jti: Mapped[str] = mapped_column(String(32))
    previous_jti: Mapped[str | None] = mapped_column(String(32), nullable=True)
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
