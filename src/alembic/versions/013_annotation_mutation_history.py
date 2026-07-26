"""add persistent annotation mutation history

Revision ID: 013_annotation_history
Revises: 012_annotation_spatial
Create Date: 2026-07-26 02:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "013_annotation_history"
down_revision = "012_annotation_spatial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "annotation_mutation_history",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("annotation_tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("operation", sa.String(), nullable=False),
        sa.Column("before_state", postgresql.JSONB(), nullable=True),
        sa.Column("after_state", postgresql.JSONB(), nullable=True),
        sa.Column(
            "undone",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "operation IN ('create', 'update', 'delete')",
            name="ck_annotation_mutation_history_operation",
        ),
    )
    op.create_index(
        "ix_annotation_mutation_history_task_created",
        "annotation_mutation_history",
        ["task_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_annotation_mutation_history_task_created",
        table_name="annotation_mutation_history",
    )
    op.drop_table("annotation_mutation_history")
