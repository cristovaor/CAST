"""add optional project status

Revision ID: 003_add_project_status
Revises: 002_multimodal_entities
Create Date: 2026-07-23 22:00:00.000000

The column is nullable so existing projects continue to derive their visible
status from their studies until a project status is explicitly set.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "003_add_project_status"
down_revision = "002_multimodal_entities"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {column["name"] for column in inspector.get_columns("projects")}
    if "status" not in columns:
        op.add_column(
            "projects",
            sa.Column(
                "status",
                postgresql.ENUM(
                    "draft",
                    "active",
                    "completed",
                    "archived",
                    name="studystatus",
                    create_type=False,
                ),
                nullable=True,
            ),
        )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {column["name"] for column in inspector.get_columns("projects")}
    if "status" in columns:
        op.drop_column("projects", "status")
