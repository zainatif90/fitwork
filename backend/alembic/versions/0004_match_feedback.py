"""Match feedback (applied/won/lost/not_relevant) for future model training

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "match_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("score_at_feedback", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "job_id", name="uq_feedback_user_job"),
        sa.CheckConstraint("outcome IN ('applied', 'won', 'lost', 'not_relevant')", name="ck_feedback_outcome"),
    )
    op.create_index("ix_match_feedback_user_id", "match_feedback", ["user_id"])
    op.create_index("ix_match_feedback_job_id", "match_feedback", ["job_id"])


def downgrade() -> None:
    op.drop_table("match_feedback")
