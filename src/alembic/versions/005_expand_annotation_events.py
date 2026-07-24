"""expand annotation events for the video annotation contract

Revision ID: 005_expand_annotations
Revises: 004_add_tenant_scope
Create Date: 2026-07-24 01:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "005_expand_annotations"
down_revision = "004_add_tenant_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "annotation_events",
        sa.Column("confidence", sa.Float(), nullable=True),
    )
    op.add_column(
        "annotation_events",
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "annotation_events",
        sa.Column(
            "annotator_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "annotation_events",
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_foreign_key(
        "fk_annotation_events_annotator_id",
        "annotation_events",
        "users",
        ["annotator_id"],
        ["id"],
    )
    op.execute("UPDATE annotation_events SET created_at = NOW() WHERE created_at IS NULL")
    op.alter_column("annotation_events", "created_at", nullable=False)


def downgrade() -> None:
    op.drop_constraint(
        "fk_annotation_events_annotator_id",
        "annotation_events",
        type_="foreignkey",
    )
    op.drop_column("annotation_events", "created_at")
    op.drop_column("annotation_events", "annotator_id")
    op.drop_column("annotation_events", "notes")
    op.drop_column("annotation_events", "confidence")
