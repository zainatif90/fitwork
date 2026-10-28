"""Profiles (with 384-dim embedding) and seeded skills table

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from app.data.skills_list import all_skills

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("skills", postgresql.ARRAY(sa.String(60)), nullable=False, server_default="{}"),
        sa.Column("experience_level", sa.String(20), nullable=False),
        sa.Column("hourly_rate", sa.Float, nullable=False),
        sa.Column("bio", sa.Text, nullable=False, server_default=""),
        sa.Column("portfolio_urls", postgresql.ARRAY(sa.String(500)), nullable=False, server_default="{}"),
        sa.Column("platforms", postgresql.ARRAY(sa.String(40)), nullable=False, server_default="{}"),
        sa.Column("embedding", Vector(384), nullable=True),
        sa.Column("embedding_status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("experience_level IN ('beginner', 'intermediate', 'expert')", name="ck_profiles_experience"),
        sa.CheckConstraint("embedding_status IN ('ready', 'pending')", name="ck_profiles_embedding_status"),
    )
    op.create_index("ix_profiles_user_id", "profiles", ["user_id"], unique=True)

    skills = op.create_table(
        "skills",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("name_lower", sa.String(60), nullable=False),
        sa.Column("category", sa.String(60), nullable=False),
    )
    op.create_index("ix_skills_name_lower", "skills", ["name_lower"], unique=True)
    op.bulk_insert(
        skills,
        [{"name": name, "name_lower": name.lower(), "category": cat} for name, cat in all_skills()],
    )


def downgrade() -> None:
    op.drop_table("skills")
    op.drop_table("profiles")
