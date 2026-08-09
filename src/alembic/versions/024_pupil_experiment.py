"""Controlled webcam pupillometry artifacts.

Revision ID: 024_pupil_experiment
Revises: 023_gaze_experiment
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "024_pupil_experiment"
down_revision = "023_gaze_experiment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("pupil_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("face_artifact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("landmark_artifacts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("environment_artifact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("environment_artifacts.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"), sa.Column("input_uri", sa.String(), nullable=False), sa.Column("input_checksum_sha256", sa.String(), nullable=False),
        sa.Column("configuration", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("metrics", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("verdict", sa.String()), sa.Column("error_message", sa.Text()), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.Column("completed_at", sa.DateTime()),
        sa.CheckConstraint("status IN ('queued','processing','ready','failed','no_go')", name="ck_pupil_runs_status"))
    op.create_index("ix_pupil_runs_session_created", "pupil_runs", ["session_id", "created_at"])
    op.create_table("pupil_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("pupil_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False), sa.Column("layer", sa.String(), nullable=False), sa.Column("storage_uri", sa.String(), nullable=False), sa.Column("checksum_sha256", sa.String(), nullable=False),
        sa.Column("schema_version", sa.String(), nullable=False, server_default="1"), sa.Column("pipeline_version", sa.String(), nullable=False, server_default="pupil-webcam-v1"),
        sa.Column("start_time_us", sa.BigInteger(), nullable=False), sa.Column("end_time_us", sa.BigInteger(), nullable=False), sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("metrics", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("provenance", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("run_id", "kind", "layer", name="uq_pupil_artifact_layer"), sa.CheckConstraint("layer IN ('RAW','DERIVED','FILTERED')", name="ck_pupil_artifacts_layer"))


def downgrade() -> None:
    op.drop_table("pupil_artifacts")
    op.drop_index("ix_pupil_runs_session_created", table_name="pupil_runs")
    op.drop_table("pupil_runs")
