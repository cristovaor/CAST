"""API request log, login audit actions and editable organization settings.

Revision ID: 025_audit_logs_and_org_settings
Revises: 024_pupil_experiment
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "025_audit_logs_and_org_settings"
down_revision = "024_pupil_experiment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE cannot run inside the migration transaction on older Postgres.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'login'")
        op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'login_failed'")

    op.add_column("organizations", sa.Column("display_name", sa.String(), nullable=True))
    op.add_column("organizations", sa.Column("institution", sa.String(), nullable=True))
    op.add_column("organizations", sa.Column("contact_email", sa.String(), nullable=True))
    op.add_column(
        "organizations",
        sa.Column("timezone", sa.String(), nullable=False, server_default="America/Sao_Paulo"),
    )
    op.add_column(
        "organizations",
        sa.Column("default_locale", sa.String(), nullable=False, server_default="pt-BR"),
    )

    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"])

    op.create_table(
        "api_request_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_label", sa.String(), nullable=True),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("path", sa.String(512), nullable=False),
        sa.Column("route", sa.String(512), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_api_request_logs_organization_id", "api_request_logs", ["organization_id"])
    op.create_index("ix_api_request_logs_status_code", "api_request_logs", ["status_code"])
    op.create_index("ix_api_request_logs_created_at", "api_request_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("api_request_logs")
    op.drop_index("ix_audit_logs_entity", table_name="audit_logs")
    for column in ("default_locale", "timezone", "contact_email", "institution", "display_name"):
        op.drop_column("organizations", column)
    # Postgres cannot drop enum values; 'login' and 'login_failed' stay.
