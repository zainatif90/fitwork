"""Proposals history

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "proposals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tone", sa.String(20), nullable=False),
        sa.Column("length", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("is_fallback", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("model", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_proposals_user_id", "proposals", ["user_id"])
    op.create_index("ix_proposals_job_id", "proposals", ["job_id"])


def downgrade() -> None:
    op.drop_table("proposals")
