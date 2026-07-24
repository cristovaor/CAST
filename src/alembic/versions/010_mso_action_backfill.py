"""restore MSO (mexeu sobrancelha) as a canonical micro-action

Revision ID: 010_mso_action_backfill
Revises: 009_add_train_model_job
Create Date: 2026-07-24 20:00:00.000000

MSO was excluded from ALL_ACTIONS per an earlier v6 spec revision but is being
restored to match the original MODELO_LSTM_V6 notebook (5 canonical actions).
Any legacy annotation rows that fell through to the CUSTOM_ catch-all (added
by migration 008) for eyebrow-related text are remapped to the canonical code.
"""
from alembic import op
import sqlalchemy as sa


revision = "010_mso_action_backfill"
down_revision = "009_add_train_model_job"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE annotation_events
        SET action = 'MSO'
        WHERE action = 'CUSTOM_MEXEU_SOBRANCELHA'
           OR lower(trim(action_label)) IN (
               'mexeu sobrancelha', 'mexeu_sobrancelha', 'sobrancelha',
               'mexeu a sobrancelha', 'levantou sobrancelha', 'levantou_sobrancelha'
           )
        """
    )


def downgrade() -> None:
    op.execute(
        "UPDATE annotation_events SET action = 'CUSTOM_MEXEU_SOBRANCELHA' WHERE action = 'MSO'"
    )
