"""add tenant scope to datasets and audit logs

Revision ID: 004_add_tenant_scope
Revises: 003_add_project_status
Create Date: 2026-07-24 00:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "004_add_tenant_scope"
down_revision = "003_add_project_status"
branch_labels = None
depends_on = None


def _add_organization_id(table_name: str) -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {column["name"] for column in inspector.get_columns(table_name)}
    if "organization_id" in columns:
        return

    op.add_column(
        table_name,
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        f"fk_{table_name}_organization_id",
        table_name,
        "organizations",
        ["organization_id"],
        ["id"],
    )
    op.create_index(
        f"ix_{table_name}_organization_id",
        table_name,
        ["organization_id"],
    )


def upgrade() -> None:
    _add_organization_id("datasets")
    _add_organization_id("audit_logs")

    # Preserve access to legacy records when their organization can be inferred.
    op.execute(
        """
        UPDATE datasets AS d
        SET organization_id = u.organization_id
        FROM users AS u
        WHERE d.created_by = u.id
          AND d.organization_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE audit_logs AS a
        SET organization_id = u.organization_id
        FROM users AS u
        WHERE a.actor_id = u.id
          AND a.organization_id IS NULL
        """
    )


def downgrade() -> None:
    for table_name in ("audit_logs", "datasets"):
        conn = op.get_bind()
        inspector = sa.inspect(conn)
        columns = {
            column["name"] for column in inspector.get_columns(table_name)
        }
        if "organization_id" not in columns:
            continue
        op.drop_index(
            f"ix_{table_name}_organization_id",
            table_name=table_name,
        )
        op.drop_constraint(
            f"fk_{table_name}_organization_id",
            table_name,
            type_="foreignkey",
        )
        op.drop_column(table_name, "organization_id")
