"""advanced scientific reports, structured groups and report provenance

Revision ID: 014_scientific_reports
Revises: 013_annotation_history
Create Date: 2026-07-26 12:00:00.000000
"""

from __future__ import annotations

import re
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "014_scientific_reports"
down_revision = "013_annotation_history"
branch_labels = None
depends_on = None


def _columns(inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}


def _slug(value: str) -> str:
    code = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return code[:60] or "group"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "study_groups" not in tables:
        op.create_table(
            "study_groups",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "study_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("studies.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("code", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False, server_default="other"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint(
                "study_id", "code", name="uq_study_groups_study_code"
            ),
            sa.CheckConstraint(
                "role IN ('control', 'intervention', 'comparison', 'other')",
                name="ck_study_groups_role",
            ),
        )
        op.create_index("ix_study_groups_study_id", "study_groups", ["study_id"])
        tables.add("study_groups")

    inspector = sa.inspect(bind)
    participant_columns = _columns(inspector, "participants")
    if "group_id" not in participant_columns:
        op.add_column(
            "participants",
            sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            "fk_participants_group_id",
            "participants",
            "study_groups",
            ["group_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index("ix_participants_group_id", "participants", ["group_id"])

    processing_columns = _columns(sa.inspect(bind), "processing_jobs")
    if "study_id" not in processing_columns:
        op.add_column(
            "processing_jobs",
            sa.Column("study_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            "fk_processing_jobs_study_id",
            "processing_jobs",
            "studies",
            ["study_id"],
            ["id"],
        )
        op.create_index("ix_processing_jobs_study_id", "processing_jobs", ["study_id"])

    report_columns = _columns(sa.inspect(bind), "analysis_reports")
    report_additions = {
        "template_key": sa.Column(
            "template_key", sa.String(), nullable=False, server_default="study_overview"
        ),
        "scope_type": sa.Column(
            "scope_type", sa.String(), nullable=False, server_default="study"
        ),
        "participant_id": sa.Column(
            "participant_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        "analysis_spec": sa.Column(
            "analysis_spec",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        "result_summary": sa.Column(
            "result_summary",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        "artifact_manifest": sa.Column(
            "artifact_manifest",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        "methodology_version": sa.Column(
            "methodology_version",
            sa.String(),
            nullable=False,
            server_default="cast-scientific-v1",
        ),
        "data_snapshot_hash": sa.Column(
            "data_snapshot_hash", sa.String(), nullable=True
        ),
    }
    for name, column in report_additions.items():
        if name not in report_columns:
            op.add_column("analysis_reports", column)
    if "participant_id" not in report_columns:
        op.create_foreign_key(
            "fk_analysis_reports_participant_id",
            "analysis_reports",
            "participants",
            ["participant_id"],
            ["id"],
            ondelete="SET NULL",
        )

    variable_columns = _columns(sa.inspect(bind), "research_variables")
    for name in ("source_key", "aggregation", "time_axis"):
        if name not in variable_columns:
            op.add_column(
                "research_variables", sa.Column(name, sa.String(), nullable=True)
            )

    # Backfill legacy free-text group/cohort labels without changing the JSON.
    rows = bind.execute(
        sa.text(
            """
            SELECT id, study_id,
                   COALESCE(
                     NULLIF(trim(demographic_group->>'grupo'), ''),
                     NULLIF(trim(demographic_group->>'cohort'), '')
                   ) AS label
            FROM participants
            WHERE group_id IS NULL AND demographic_group IS NOT NULL
            """
        )
    ).mappings()
    known: dict[tuple[uuid.UUID, str], uuid.UUID] = {}
    for row in rows:
        label = row["label"]
        if not label:
            continue
        base_code = _slug(label)
        key = (row["study_id"], base_code)
        group_id = known.get(key)
        if group_id is None:
            existing = bind.execute(
                sa.text(
                    "SELECT id FROM study_groups "
                    "WHERE study_id = :study_id AND code = :code"
                ),
                {"study_id": row["study_id"], "code": base_code},
            ).scalar()
            group_id = existing or uuid.uuid4()
            if not existing:
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO study_groups (id, study_id, code, name, role)
                        VALUES (:id, :study_id, :code, :name, 'other')
                        """
                    ),
                    {
                        "id": group_id,
                        "study_id": row["study_id"],
                        "code": base_code,
                        "name": label,
                    },
                )
            known[key] = group_id
        bind.execute(
            sa.text("UPDATE participants SET group_id = :group_id WHERE id = :id"),
            {"group_id": group_id, "id": row["id"]},
        )

    inspector = sa.inspect(bind)
    index_names = {item["name"] for item in inspector.get_indexes("study_groups")}
    if "uq_study_groups_single_control" not in index_names:
        op.create_index(
            "uq_study_groups_single_control",
            "study_groups",
            ["study_id"],
            unique=True,
            postgresql_where=sa.text("role = 'control'"),
        )


def downgrade() -> None:
    op.drop_index("uq_study_groups_single_control", table_name="study_groups")
    for name in ("time_axis", "aggregation", "source_key"):
        op.drop_column("research_variables", name)
    op.drop_constraint(
        "fk_analysis_reports_participant_id",
        "analysis_reports",
        type_="foreignkey",
    )
    for name in (
        "data_snapshot_hash",
        "methodology_version",
        "artifact_manifest",
        "result_summary",
        "analysis_spec",
        "participant_id",
        "scope_type",
        "template_key",
    ):
        op.drop_column("analysis_reports", name)
    op.drop_index("ix_processing_jobs_study_id", table_name="processing_jobs")
    op.drop_constraint(
        "fk_processing_jobs_study_id", "processing_jobs", type_="foreignkey"
    )
    op.drop_column("processing_jobs", "study_id")
    op.drop_index("ix_participants_group_id", table_name="participants")
    op.drop_constraint(
        "fk_participants_group_id", "participants", type_="foreignkey"
    )
    op.drop_column("participants", "group_id")
    op.drop_index("ix_study_groups_study_id", table_name="study_groups")
    op.drop_table("study_groups")
