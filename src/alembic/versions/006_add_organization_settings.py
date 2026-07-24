"""persist organization and pipeline settings

Revision ID: 006_organization_settings
Revises: 005_expand_annotations
Create Date: 2026-07-24 01:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "006_organization_settings"
down_revision = "005_expand_annotations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("plan", sa.String(), nullable=False, server_default="standard"))
    op.add_column("organizations", sa.Column("max_storage_gb", sa.Float(), nullable=False, server_default="100"))
    op.add_column("organizations", sa.Column("used_storage_gb", sa.Float(), nullable=False, server_default="0"))
    op.add_column("organizations", sa.Column("pipeline_settings", postgresql.JSONB(), nullable=False, server_default="{}"))


def downgrade() -> None:
    op.drop_column("organizations", "pipeline_settings")
    op.drop_column("organizations", "used_storage_gb")
    op.drop_column("organizations", "max_storage_gb")
    op.drop_column("organizations", "plan")
