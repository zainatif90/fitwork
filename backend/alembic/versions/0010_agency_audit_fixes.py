"""Agency audit fixes: invite links expire, one "taken" assignment per job enforced by the database

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-02
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TAKEN = "('assigned', 'applied', 'won', 'lost')"


def upgrade() -> None:
    op.add_column("agency_members", sa.Column("invite_sent_at", sa.DateTime(timezone=True), nullable=True))
    # Existing pending invites count from when they were sent
    op.execute("UPDATE agency_members SET invite_sent_at = invited_at WHERE status = 'invited'")
    # If old data already holds two taken rows for one job (should never happen), keep the oldest and mark the
    # others declined, so the unique index can be created and the server still starts.
    op.execute(f"""
        UPDATE assignments a SET status = 'declined'
        WHERE a.status IN {TAKEN} AND EXISTS (
            SELECT 1 FROM assignments b
            WHERE b.agency_id = a.agency_id AND b.job_id = a.job_id AND b.status IN {TAKEN}
              AND (b.created_at, b.id) < (a.created_at, a.id))
    """)
    op.create_index("uq_assignments_taken_job", "assignments", ["agency_id", "job_id"], unique=True,
                    postgresql_where=sa.text(f"status IN {TAKEN}"))


def downgrade() -> None:
    op.drop_index("uq_assignments_taken_job", table_name="assignments")
    op.drop_column("agency_members", "invite_sent_at")
