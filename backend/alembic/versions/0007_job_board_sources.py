"""Allow jobs from remote job boards (Himalayas, Remotive, Jobicy)

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-30
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_jobs_source", "jobs", type_="check")
    op.create_check_constraint(
        "ck_jobs_source", "jobs",
        "source IN ('freelancer', 'upwork', 'himalayas', 'remotive', 'jobicy', 'csv', 'manual', 'synthetic')",
    )


def downgrade() -> None:
    op.execute("DELETE FROM jobs WHERE source IN ('himalayas', 'remotive', 'jobicy')")
    op.drop_constraint("ck_jobs_source", "jobs", type_="check")
    op.create_check_constraint(
        "ck_jobs_source", "jobs", "source IN ('freelancer', 'upwork', 'csv', 'manual', 'synthetic')"
    )
