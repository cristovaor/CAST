"""Calibrated gaze experiment artifacts.

Revision ID: 023_gaze_experiment
Revises: 022_lsl_recordings
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "023_gaze_experiment"
down_revision = "022_lsl_recordings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("gaze_calibrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="collecting"),
        sa.Column("configuration", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("metrics", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("verdict", sa.String()), sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.Column("completed_at", sa.DateTime()),
        sa.CheckConstraint("status IN ('collecting','processing','ready','failed','no_go')", name="ck_gaze_calibrations_status"))
    op.create_index("ix_gaze_calibrations_session_created", "gaze_calibrations", ["session_id", "created_at"])
    op.create_table("gaze_calibration_samples",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("calibration_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gaze_calibrations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_sample_id", sa.String(), nullable=False), sa.Column("phase", sa.String(), nullable=False),
        sa.Column("target_x", sa.Float(), nullable=False), sa.Column("target_y", sa.Float(), nullable=False),
        sa.Column("iris_offset_x", sa.Float()), sa.Column("iris_offset_y", sa.Float()), sa.Column("head_yaw_deg", sa.Float()), sa.Column("head_pitch_deg", sa.Float()),
        sa.Column("source_time_us", sa.BigInteger(), nullable=False), sa.Column("source_clock_id", sa.String(), nullable=False),
        sa.Column("canonical_time_us", sa.BigInteger()), sa.Column("uncertainty_us", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("quality_flags", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")), sa.Column("valid", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("calibration_id", "client_sample_id", name="uq_gaze_calibration_sample_client"),
        sa.CheckConstraint("phase IN ('fit','validation','drift')", name="ck_gaze_calibration_samples_phase"))
    op.create_index("ix_gaze_samples_calibration_time", "gaze_calibration_samples", ["calibration_id", "source_time_us"])
    op.create_table("gaze_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("calibration_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gaze_calibrations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False), sa.Column("layer", sa.String(), nullable=False),
        sa.Column("storage_uri", sa.String(), nullable=False), sa.Column("checksum_sha256", sa.String(), nullable=False),
        sa.Column("schema_version", sa.String(), nullable=False, server_default="1"), sa.Column("pipeline_version", sa.String(), nullable=False, server_default="gaze-ridge-v1"),
        sa.Column("start_time_us", sa.BigInteger(), nullable=False), sa.Column("end_time_us", sa.BigInteger(), nullable=False), sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("metrics", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("provenance", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("calibration_id", "kind", "layer", name="uq_gaze_artifact_layer"),
        sa.CheckConstraint("layer IN ('RAW','FILTERED','MODEL_OUTPUT')", name="ck_gaze_artifacts_layer"))


def downgrade() -> None:
    op.drop_table("gaze_artifacts")
    op.drop_index("ix_gaze_samples_calibration_time", table_name="gaze_calibration_samples")
    op.drop_table("gaze_calibration_samples")
    op.drop_index("ix_gaze_calibrations_session_created", table_name="gaze_calibrations")
    op.drop_table("gaze_calibrations")
