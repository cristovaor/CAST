"""versioned, auditable synchronization processing

Revision ID: 016_sync_processing
Revises: 015_participant_status
Create Date: 2026-07-26 18:30:00.000000
"""

from __future__ import annotations

import hashlib
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "016_sync_processing"
down_revision = "015_participant_status"
branch_labels = None
depends_on = None


def _columns(inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "session_id" not in _columns(inspector, "processing_jobs"):
        op.add_column(
            "processing_jobs",
            sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            "fk_processing_jobs_session_id",
            "processing_jobs",
            "sessions",
            ["session_id"],
            ["id"],
        )
        op.create_index(
            "ix_processing_jobs_session_id",
            "processing_jobs",
            ["session_id"],
        )

    if "sync_evidence" not in tables:
        op.create_table(
            "sync_evidence",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("kind", sa.String(), nullable=False),
            sa.Column("filename", sa.String(), nullable=True),
            sa.Column("content_type", sa.String(), nullable=True),
            sa.Column("storage_uri", sa.String(), nullable=True),
            sa.Column("checksum_sha256", sa.String(), nullable=False),
            sa.Column(
                "payload",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "metadata_info",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["session_id"],
                ["sessions.id"],
                name="fk_sync_evidence_session_id",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["created_by"],
                ["users.id"],
                name="fk_sync_evidence_created_by",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_sync_evidence_session_id", "sync_evidence", ["session_id"])
        op.create_index("ix_sync_evidence_kind", "sync_evidence", ["kind"])

    if "sync_runs" not in tables:
        op.create_table(
            "sync_runs",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("method", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="queued"),
            sa.Column("outcome", sa.String(), nullable=True),
            sa.Column("algorithm_version", sa.String(), nullable=False, server_default="sync-v1"),
            sa.Column(
                "input_manifest",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("input_hash", sa.String(), nullable=False),
            sa.Column(
                "parameters",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "result",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "metrics",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("quality_grade", sa.String(), nullable=True),
            sa.Column("uncertainty_ms", sa.Float(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("review_decision", sa.String(), nullable=True),
            sa.Column("review_justification", sa.Text(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(
                ["session_id"],
                ["sessions.id"],
                name="fk_sync_runs_session_id",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["job_id"],
                ["processing_jobs.id"],
                name="fk_sync_runs_job_id",
                ondelete="SET NULL",
            ),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_sync_runs_created_by"),
            sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], name="fk_sync_runs_reviewed_by"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("job_id", name="uq_sync_runs_job_id"),
            sa.UniqueConstraint("input_hash", name="uq_sync_runs_input_hash"),
        )
        op.create_index("ix_sync_runs_session_id", "sync_runs", ["session_id"])
        op.create_index("ix_sync_runs_method", "sync_runs", ["method"])
        op.create_index("ix_sync_runs_status", "sync_runs", ["status"])

    inspector = sa.inspect(bind)
    sync_columns = _columns(inspector, "synchronizations")
    if "approved_run_id" not in sync_columns:
        op.add_column(
            "synchronizations",
            sa.Column("approved_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            "fk_synchronizations_approved_run_id",
            "synchronizations",
            "sync_runs",
            ["approved_run_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if "mapping_version" not in sync_columns:
        op.add_column(
            "synchronizations",
            sa.Column(
                "mapping_version",
                sa.String(),
                nullable=False,
                server_default="affine-v1",
            ),
        )
    if "quality_grade" not in sync_columns:
        op.add_column("synchronizations", sa.Column("quality_grade", sa.String(), nullable=True))
    if "uncertainty_ms" not in sync_columns:
        op.add_column("synchronizations", sa.Column("uncertainty_ms", sa.Float(), nullable=True))

    # Preserve every pre-v016 record as an immutable audit run. No legacy run is
    # approved automatically because the previous offset sign was ambiguous.
    metadata = sa.MetaData()
    sync_runs = sa.Table("sync_runs", metadata, autoload_with=bind)
    legacy_rows = bind.execute(
        sa.text(
            "SELECT id, session_id, state, method, offset_ms, drift_ms_per_min, "
            "confidence, anchors, history, approved_by, created_at, updated_at "
            "FROM synchronizations"
        )
    ).mappings()
    for row in legacy_rows:
        source_id = str(row["id"])
        input_hash = hashlib.sha256(f"legacy:{source_id}".encode("utf-8")).hexdigest()
        exists = bind.execute(
            sa.select(sync_runs.c.id).where(sync_runs.c.input_hash == input_hash)
        ).first()
        if exists:
            continue
        bind.execute(
            sync_runs.insert().values(
                id=uuid.uuid4(),
                session_id=row["session_id"],
                method=row["method"] or "manual",
                status="succeeded",
                outcome="legacy_pending",
                algorithm_version="legacy",
                input_manifest={
                    "legacy_synchronization_id": source_id,
                    "history": row["history"] or [],
                },
                input_hash=input_hash,
                parameters={},
                result={
                    "mapping_version": "legacy",
                    "offset_ms": row["offset_ms"] or 0,
                    "drift_ms_per_min": row["drift_ms_per_min"],
                    "confidence": row["confidence"],
                    "anchors": row["anchors"] or [],
                },
                metrics={"legacy_state": str(row["state"])},
                quality_grade="insufficient",
                created_by=row["approved_by"],
                created_at=row["created_at"] or row["updated_at"],
                finished_at=row["updated_at"],
            )
        )
    bind.execute(
        sa.text(
            "UPDATE synchronizations SET mapping_version = 'legacy', "
            "quality_grade = COALESCE(quality_grade, 'insufficient') "
            "WHERE approved_run_id IS NULL"
        )
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    sync_columns = _columns(inspector, "synchronizations")
    if "approved_run_id" in sync_columns:
        op.drop_constraint(
            "fk_synchronizations_approved_run_id",
            "synchronizations",
            type_="foreignkey",
        )
        op.drop_column("synchronizations", "approved_run_id")
    for column in ("uncertainty_ms", "quality_grade", "mapping_version"):
        if column in sync_columns:
            op.drop_column("synchronizations", column)

    tables = set(inspector.get_table_names())
    if "sync_runs" in tables:
        op.drop_table("sync_runs")
    if "sync_evidence" in tables:
        op.drop_table("sync_evidence")

    job_columns = _columns(sa.inspect(op.get_bind()), "processing_jobs")
    if "session_id" in job_columns:
        op.drop_index("ix_processing_jobs_session_id", table_name="processing_jobs")
        op.drop_constraint(
            "fk_processing_jobs_session_id",
            "processing_jobs",
            type_="foreignkey",
        )
        op.drop_column("processing_jobs", "session_id")
