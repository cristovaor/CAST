"""add create and update audit actions

Revision ID: 007_audit_change_actions
Revises: 006_organization_settings
Create Date: 2026-07-24 12:00:00.000000
"""

from alembic import op


revision = "007_audit_change_actions"
down_revision = "006_organization_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'create'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'update'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely without recreating the
    # type. Keeping the values is harmless for a downgrade.
    pass
