"""add spatial metadata to annotation events

Revision ID: 012_annotation_spatial
Revises: 011_add_model_test_run_job
Create Date: 2026-07-26 01:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "012_annotation_spatial"
down_revision = "011_add_model_test_run_job"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "annotation_events",
        sa.Column("region", sa.String(), nullable=True),
    )
    op.add_column(
        "annotation_events",
        sa.Column(
            "side",
            sa.String(),
            nullable=False,
            server_default="unspecified",
        ),
    )
    op.add_column(
        "annotation_events",
        sa.Column(
            "spatial_metadata",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "annotation_events",
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_check_constraint(
        "ck_annotation_events_side",
        "annotation_events",
        "side IN ('left', 'right', 'both', 'center', 'whole', 'unspecified')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_annotation_events_side",
        "annotation_events",
        type_="check",
    )
    op.drop_column("annotation_events", "revision")
    op.drop_column("annotation_events", "spatial_metadata")
    op.drop_column("annotation_events", "side")
    op.drop_column("annotation_events", "region")
