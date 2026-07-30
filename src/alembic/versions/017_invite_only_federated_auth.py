"""invite-only federated authentication (Google) support

Adds:
  * users.password_hash becomes nullable (federated accounts have no password)
  * users.is_active flag so access can be revoked without deleting audit trails
  * user_identities: federated logins bound to a local user by provider subject
  * invitations: single-use, expiring authorizations to create an account

Revision ID: 017_invite_only_auth
Revises: 016_sync_processing
Create Date: 2026-07-28 10:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "017_invite_only_auth"
down_revision = "016_sync_processing"
branch_labels = None
depends_on = None


_USER_ROLE = postgresql.ENUM(
    "admin", "researcher", "annotator", "viewer", name="userrole", create_type=False
)


def _table_names(inspector) -> set[str]:
    return set(inspector.get_table_names())


def _columns(inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "users" in tables:
        user_columns = _columns(inspector, "users")
        # Federated accounts never carry a local password hash.
        op.alter_column("users", "password_hash", existing_type=sa.String(), nullable=True)
        if "is_active" not in user_columns:
            op.add_column(
                "users",
                sa.Column(
                    "is_active",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("true"),
                ),
            )

    if "user_identities" not in tables:
        op.create_table(
            "user_identities",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("subject", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("last_login_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint(
                "provider", "subject", name="uq_user_identities_provider_subject"
            ),
        )
        op.create_index("ix_user_identities_user_id", "user_identities", ["user_id"])

    if "invitations" not in tables:
        op.create_table(
            "invitations",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("token_hash", sa.String(), nullable=False, unique=True),
            sa.Column(
                "organization_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column("role", _USER_ROLE, nullable=False, server_default="researcher"),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column(
                "invited_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")
            ),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("consumed_at", sa.DateTime(), nullable=True),
            sa.Column(
                "consumed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")
            ),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_invitations_email", "invitations", ["email"])
        # Partial index: lookups only ever scan invitations still usable.
        op.create_index(
            "ix_invitations_email_pending",
            "invitations",
            ["email", "expires_at"],
            postgresql_where=sa.text("consumed_at IS NULL AND revoked_at IS NULL"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = _table_names(inspector)

    if "invitations" in tables:
        op.drop_index("ix_invitations_email_pending", table_name="invitations")
        op.drop_index("ix_invitations_email", table_name="invitations")
        op.drop_table("invitations")

    if "user_identities" in tables:
        op.drop_index("ix_user_identities_user_id", table_name="user_identities")
        op.drop_table("user_identities")

    if "users" in tables:
        if "is_active" in _columns(inspector, "users"):
            op.drop_column("users", "is_active")
        # Rows without a hash would violate the restored NOT NULL; they are
        # federated-only accounts and cannot be represented in the old schema.
        op.execute("DELETE FROM users WHERE password_hash IS NULL")
        op.alter_column("users", "password_hash", existing_type=sa.String(), nullable=False)
