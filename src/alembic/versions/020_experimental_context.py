"""Experimental context and environmental series.

Revision ID: 020_experimental_context
Revises: 019_live_capture_and_bookmarks
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "020_experimental_context"
down_revision = "019_live_capture_and_bookmarks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "experimental_trials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_trial_id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("source_clock_id", sa.String(), nullable=False),
        sa.Column("started_source_time_us", sa.BigInteger(), nullable=False),
        sa.Column("ended_source_time_us", sa.BigInteger()),
        sa.Column("started_canonical_time_us", sa.BigInteger()),
        sa.Column("ended_canonical_time_us", sa.BigInteger()),
        sa.Column("uncertainty_us", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("quality_flags", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("valid", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("metadata_info", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "client_trial_id", name="uq_experimental_trials_client"),
        sa.CheckConstraint("ended_canonical_time_us IS NULL OR started_canonical_time_us IS NULL OR ended_canonical_time_us >= started_canonical_time_us", name="ck_experimental_trials_range"),
    )
    op.create_index("ix_experimental_trials_session_id", "experimental_trials", ["session_id"])
    op.create_table(
        "stimulus_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_stimulus_id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("storage_uri", sa.String()), sa.Column("mime_type", sa.String()), sa.Column("checksum_sha256", sa.String()),
        sa.Column("metadata_info", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "client_stimulus_id", name="uq_stimulus_assets_client"),
    )
    op.create_index("ix_stimulus_assets_session_id", "stimulus_assets", ["session_id"])
    op.create_table(
        "experimental_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trial_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("experimental_trials.id", ondelete="SET NULL")),
        sa.Column("client_event_id", sa.String(), nullable=False), sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("source_time_us", sa.BigInteger(), nullable=False), sa.Column("source_clock_id", sa.String(), nullable=False),
        sa.Column("canonical_time_us", sa.BigInteger()), sa.Column("uncertainty_us", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("quality_flags", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("valid", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "client_event_id", name="uq_experimental_events_client"),
    )
    op.create_index("ix_experimental_events_session_canonical", "experimental_events", ["session_id", "canonical_time_us"])
    op.create_table(
        "environment_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False), sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("unit", sa.String(), nullable=False), sa.Column("method", sa.String(), nullable=False),
        sa.Column("raw_uri", sa.String(), nullable=False), sa.Column("derived_uri", sa.String()),
        sa.Column("raw_checksum_sha256", sa.String(), nullable=False), sa.Column("derived_checksum_sha256", sa.String()),
        sa.Column("start_time_us", sa.BigInteger(), nullable=False), sa.Column("end_time_us", sa.BigInteger(), nullable=False),
        sa.Column("sample_count", sa.BigInteger(), nullable=False), sa.Column("source_clock_id", sa.String(), nullable=False),
        sa.Column("provenance", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("error_message", sa.Text()), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("end_time_us >= start_time_us", name="ck_environment_artifacts_range"),
    )
    op.create_index("ix_environment_artifacts_session_kind_created", "environment_artifacts", ["session_id", "kind", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_environment_artifacts_session_kind_created", table_name="environment_artifacts"); op.drop_table("environment_artifacts")
    op.drop_index("ix_experimental_events_session_canonical", table_name="experimental_events"); op.drop_table("experimental_events")
    op.drop_index("ix_stimulus_assets_session_id", table_name="stimulus_assets"); op.drop_table("stimulus_assets")
    op.drop_index("ix_experimental_trials_session_id", table_name="experimental_trials"); op.drop_table("experimental_trials")
