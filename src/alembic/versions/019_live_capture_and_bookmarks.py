"""Resumable live video capture parts and research bookmarks.

Revision ID: 019_live_capture_and_bookmarks
Revises: 018_eeg_analysis_v2
Create Date: 2026-08-09 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "019_live_capture_and_bookmarks"
down_revision = "018_eeg_analysis_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "video_capture_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("status", sa.String(), nullable=False, server_default="created"),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("object_key", sa.String(), nullable=False, unique=True),
        sa.Column("upload_id", sa.String(), unique=True),
        sa.Column(
            "finalization_job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("processing_jobs.id", ondelete="SET NULL"),
            unique=True,
        ),
        sa.Column(
            "video_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("video_assets.id", ondelete="SET NULL"),
            unique=True,
        ),
        sa.Column(
            "camera_constraints",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "browser_clock",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "sync_anchors",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("started_source_time_us", sa.BigInteger()),
        sa.Column("ended_source_time_us", sa.BigInteger()),
        sa.Column("started_canonical_time_us", sa.BigInteger()),
        sa.Column("ended_canonical_time_us", sa.BigInteger()),
        sa.Column("expected_size_bytes", sa.BigInteger()),
        sa.Column("received_size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("checksum_sha256", sa.String()),
        sa.Column("pts_uri", sa.String()),
        sa.Column("pts_checksum_sha256", sa.String()),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime()),
        sa.Column("aborted_at", sa.DateTime()),
        sa.CheckConstraint(
            "status IN ('created', 'uploading', 'completing', 'completed', "
            "'validating', 'ready', 'aborted', 'failed')",
            name="ck_video_capture_runs_status",
        ),
    )
    op.create_index(
        "ix_video_capture_runs_session_status_created",
        "video_capture_runs",
        ["session_id", "status", "created_at"],
    )

    op.create_table(
        "video_capture_parts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "capture_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("video_capture_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("part_number", sa.Integer(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum_sha256", sa.String(), nullable=False),
        sa.Column("etag", sa.String(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "capture_run_id", "part_number", name="uq_video_capture_parts_number"
        ),
        sa.CheckConstraint("part_number > 0", name="ck_video_capture_parts_number"),
        sa.CheckConstraint("size_bytes >= 0", name="ck_video_capture_parts_size"),
    )
    op.create_index(
        "ix_video_capture_parts_run_number",
        "video_capture_parts",
        ["capture_run_id", "part_number"],
    )

    op.create_table(
        "research_bookmarks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("client_event_id", sa.String(), nullable=False),
        sa.Column("start_canonical_time_us", sa.BigInteger(), nullable=False),
        sa.Column("end_canonical_time_us", sa.BigInteger()),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("comment", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "session_id", "client_event_id", name="uq_research_bookmarks_client_event"
        ),
        sa.CheckConstraint(
            "end_canonical_time_us IS NULL OR "
            "end_canonical_time_us >= start_canonical_time_us",
            name="ck_research_bookmarks_range",
        ),
    )
    op.create_index(
        "ix_research_bookmarks_session_range",
        "research_bookmarks",
        ["session_id", "start_canonical_time_us", "end_canonical_time_us"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_research_bookmarks_session_range", table_name="research_bookmarks"
    )
    op.drop_table("research_bookmarks")
    op.drop_index(
        "ix_video_capture_parts_run_number", table_name="video_capture_parts"
    )
    op.drop_table("video_capture_parts")
    op.drop_index(
        "ix_video_capture_runs_session_status_created",
        table_name="video_capture_runs",
    )
    op.drop_table("video_capture_runs")
