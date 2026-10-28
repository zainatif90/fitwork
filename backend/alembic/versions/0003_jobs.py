"""Jobs table with HNSW cosine index

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("skills", postgresql.ARRAY(sa.String(80)), nullable=False, server_default="{}"),
        sa.Column("budget_min", sa.Float, nullable=True),
        sa.Column("budget_max", sa.Float, nullable=True),
        sa.Column("budget_type", sa.String(10), nullable=False, server_default="fixed"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("client_country", sa.String(80), nullable=True),
        sa.Column("client_hire_rate", sa.Float, nullable=True),
        sa.Column("proposals_count", sa.Integer, nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("embedding", Vector(384), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("source", "external_id", name="uq_jobs_source_external_id"),
        sa.CheckConstraint("source IN ('freelancer', 'upwork', 'csv', 'manual', 'synthetic')", name="ck_jobs_source"),
        sa.CheckConstraint("budget_type IN ('fixed', 'hourly')", name="ck_jobs_budget_type"),
    )
    op.create_index("ix_jobs_active_posted", "jobs", ["is_active", "posted_at"])
    # HNSW = graph-based approximate nearest-neighbour index; vector_cosine_ops = cosine distance (<=>)
    op.execute("CREATE INDEX ix_jobs_embedding_hnsw ON jobs USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    op.drop_table("jobs")
