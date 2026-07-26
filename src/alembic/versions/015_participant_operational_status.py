"""add participant operational status

Revision ID: 015_participant_status
Revises: 014_scientific_reports
Create Date: 2026-07-26 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "015_participant_status"
down_revision = "014_scientific_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("participants")}

    if "is_active" not in columns:
        op.add_column(
            "participants",
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )
    if "deactivated_at" not in columns:
        op.add_column(
            "participants",
            sa.Column("deactivated_at", sa.DateTime(), nullable=True),
        )
    if "deactivation_reason" not in columns:
        op.add_column(
            "participants",
            sa.Column("deactivation_reason", sa.Text(), nullable=True),
        )

    indexes = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("participants")}
    if "ix_participants_is_active" not in indexes:
        op.create_index("ix_participants_is_active", "participants", ["is_active"])


def downgrade() -> None:
    indexes = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("participants")}
    if "ix_participants_is_active" in indexes:
        op.drop_index("ix_participants_is_active", table_name="participants")
    op.drop_column("participants", "deactivation_reason")
    op.drop_column("participants", "deactivated_at")
    op.drop_column("participants", "is_active")
