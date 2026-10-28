"""Agency mode: agencies, members/invites, assignments

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "agencies",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("owner_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "agency_members",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("agency_id", UUID, sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, unique=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="invited"),
        sa.Column("invite_token_hash", sa.String(64), nullable=True, unique=True),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('invited', 'active')", name="ck_agency_members_status"),
    )
    op.create_index("ix_agency_members_agency_id", "agency_members", ["agency_id"])
    op.create_table(
        "assignments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("agency_id", UUID, sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", UUID, sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("score", sa.Integer, nullable=True),
        sa.Column("assigned_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('recommended', 'assigned', 'declined', 'applied', 'won', 'lost')", name="ck_assignments_status"
        ),
    )
    op.create_index("ix_assignments_agency_id", "assignments", ["agency_id"])
    op.create_index("ix_assignments_job_id", "assignments", ["job_id"])
    op.create_index("ix_assignments_member_id", "assignments", ["member_id"])


def downgrade() -> None:
    op.drop_table("assignments")
    op.drop_table("agency_members")
    op.drop_table("agencies")
