"""EEG analysis v2 bundles, runs, artifacts and job routing.

Revision ID: 018_eeg_analysis_v2
Revises: 017_invite_only_auth
Create Date: 2026-07-30 23:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "018_eeg_analysis_v2"
down_revision = "017_invite_only_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    # PostgreSQL enum additions must be committed before the new value is used.
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE jobtype ADD VALUE IF NOT EXISTS 'eeg_analysis'")
        op.execute("COMMIT")

    op.create_table(
        "eeg_asset_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "eeg_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("eeg_assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(), nullable=False, server_default="primary"),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column(
            "mime_type",
            sa.String(),
            nullable=False,
            server_default="application/octet-stream",
        ),
        sa.Column("storage_uri", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum_sha256", sa.String(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("verified_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "eeg_asset_id", "filename", name="uq_eeg_asset_files_filename"
        ),
    )
    op.create_index(
        "ix_eeg_asset_files_asset_role", "eeg_asset_files", ["eeg_asset_id", "role"]
    )

    op.add_column(
        "processing_jobs",
        sa.Column(
            "eeg_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("eeg_assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_processing_jobs_eeg_asset_id", "processing_jobs", ["eeg_asset_id"]
    )

    op.create_table(
        "eeg_analysis_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "eeg_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("eeg_assets.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "study_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("studies.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("processing_jobs.id", ondelete="SET NULL"),
            unique=True,
        ),
        sa.Column("scope_type", sa.String(), nullable=False),
        sa.Column("pipeline", sa.String(), nullable=False, server_default="individual"),
        sa.Column("profile", sa.String(), nullable=False, server_default="custom"),
        sa.Column(
            "parameters", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column(
            "input_manifest", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")
        ),
        sa.Column("input_hash", sa.String(), nullable=False),
        sa.Column("package_version", sa.String()),
        sa.Column("upstream_commit", sa.String()),
        sa.Column("mdmp_version", sa.String()),
        sa.Column("mdmp_commit", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column(
            "step_status", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column(
            "warnings", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")
        ),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime()),
        sa.Column("finished_at", sa.DateTime()),
        sa.CheckConstraint("scope_type IN ('session', 'study')", name="ck_eeg_analysis_runs_scope"),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'canceled')",
            name="ck_eeg_analysis_runs_status",
        ),
    )
    op.create_index(
        "ix_eeg_analysis_runs_asset_status_created",
        "eeg_analysis_runs",
        ["eeg_asset_id", "status", "created_at"],
    )
    op.create_index(
        "ix_eeg_analysis_runs_study_status_created",
        "eeg_analysis_runs",
        ["study_id", "status", "created_at"],
    )
    op.create_index(
        "ix_eeg_analysis_runs_input_hash", "eeg_analysis_runs", ["input_hash"]
    )

    op.create_table(
        "eeg_analysis_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("eeg_analysis_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("storage_uri", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum_sha256", sa.String(), nullable=False),
        sa.Column("units", sa.String()),
        sa.Column(
            "metadata_info", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_eeg_analysis_artifacts_run_kind",
        "eeg_analysis_artifacts",
        ["run_id", "kind"],
    )

    # Legacy assets remain valid and receive a primary bundle member. A missing
    # checksum is explicit instead of fabricated; upload completion verifies it.
    op.execute(
        """
        INSERT INTO eeg_asset_files
            (id, eeg_asset_id, role, filename, mime_type, storage_uri,
             size_bytes, checksum_sha256, is_primary, created_at)
        SELECT
            md5(random()::text || clock_timestamp()::text || id::text)::uuid,
            id, 'primary', COALESCE(filename, 'recording'),
            COALESCE(mime_type, 'application/octet-stream'), storage_uri,
            COALESCE(size_bytes, 0), 'legacy-unverified',
            true, COALESCE(created_at, now())
        FROM eeg_assets
        WHERE storage_uri IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_eeg_analysis_artifacts_run_kind", table_name="eeg_analysis_artifacts"
    )
    op.drop_table("eeg_analysis_artifacts")
    op.drop_index("ix_eeg_analysis_runs_input_hash", table_name="eeg_analysis_runs")
    op.drop_index(
        "ix_eeg_analysis_runs_study_status_created", table_name="eeg_analysis_runs"
    )
    op.drop_index(
        "ix_eeg_analysis_runs_asset_status_created", table_name="eeg_analysis_runs"
    )
    op.drop_table("eeg_analysis_runs")
    op.drop_index("ix_processing_jobs_eeg_asset_id", table_name="processing_jobs")
    op.drop_column("processing_jobs", "eeg_asset_id")
    op.drop_index("ix_eeg_asset_files_asset_role", table_name="eeg_asset_files")
    op.drop_table("eeg_asset_files")
    # PostgreSQL cannot safely remove one enum value in place. Keeping the
    # unused value makes this downgrade data-preserving and reversible.
