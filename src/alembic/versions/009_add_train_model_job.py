"""add train_model job type and processing_jobs.result

Revision ID: 009_add_train_model_job
Revises: 008_annotation_landmarks
Create Date: 2026-07-24 19:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "009_add_train_model_job"
down_revision = "008_annotation_landmarks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TYPE jobtype ADD VALUE IF NOT EXISTS 'train_model'"))

    op.add_column(
        "processing_jobs",
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.alter_column(
        "processing_jobs",
        "video_asset_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    op.drop_column("processing_jobs", "result")
    # Postgres cannot remove an enum value; downgrade leaves 'train_model' in place.
