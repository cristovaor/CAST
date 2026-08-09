"""LSL/XDF acquisition catalog.

Revision ID: 022_lsl_recordings
Revises: 021_face_landmarker_v2
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "022_lsl_recordings"
down_revision = "021_face_landmarker_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lsl_recordings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="awaiting_agent"),
        sa.Column("agent_id", sa.String(), nullable=False), sa.Column("object_key", sa.String(), nullable=False, unique=True),
        sa.Column("selected_stream_ids", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("discovery_snapshot", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("browser_clock", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("checksum_sha256", sa.String()), sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("eeg_asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eeg_assets.id", ondelete="SET NULL"), unique=True),
        sa.Column("sync_evidence_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sync_evidence.id", ondelete="SET NULL"), unique=True),
        sa.Column("started_source_time_us", sa.BigInteger()), sa.Column("ended_source_time_us", sa.BigInteger()),
        sa.Column("started_at", sa.DateTime()), sa.Column("completed_at", sa.DateTime()), sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('awaiting_agent','recording','completed','processing','ready','failed','aborted')", name="ck_lsl_recordings_status"),
    )
    op.create_index("ix_lsl_recordings_session_status_created", "lsl_recordings", ["session_id", "status", "created_at"])
    op.create_table(
        "lsl_recording_streams",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("recording_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("lsl_recordings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stream_uid", sa.String(), nullable=False), sa.Column("name", sa.String(), nullable=False),
        sa.Column("stream_type", sa.String(), nullable=False), sa.Column("source_id", sa.String()), sa.Column("hostname", sa.String()),
        sa.Column("channel_count", sa.Integer()), sa.Column("nominal_srate", sa.Float()), sa.Column("channel_format", sa.String()),
        sa.Column("clock_offset_seconds", sa.Float()),
        sa.Column("metadata_info", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("recording_id", "stream_uid", name="uq_lsl_recording_stream_uid"),
    )
    op.create_index("ix_lsl_recording_streams_recording_type", "lsl_recording_streams", ["recording_id", "stream_type"])


def downgrade() -> None:
    op.drop_index("ix_lsl_recording_streams_recording_type", table_name="lsl_recording_streams")
    op.drop_table("lsl_recording_streams")
    op.drop_index("ix_lsl_recordings_session_status_created", table_name="lsl_recordings")
    op.drop_table("lsl_recordings")
