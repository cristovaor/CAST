"""add model_test_run job type

Revision ID: 011_add_model_test_run_job
Revises: 010_mso_action_backfill
Create Date: 2026-07-25 00:00:00.000000

Supports testing a specific (draft/candidate) ModelVersion against chosen
videos without promoting it to "active" first.
"""
from alembic import op
import sqlalchemy as sa


revision = "011_add_model_test_run_job"
down_revision = "010_mso_action_backfill"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TYPE jobtype ADD VALUE IF NOT EXISTS 'model_test_run'"))


def downgrade() -> None:
    # Postgres cannot remove an enum value; downgrade leaves 'model_test_run' in place.
    pass
