"""add landmark artifacts and immutable prediction reviews

Revision ID: 008_annotation_landmarks
Revises: 007_audit_change_actions
Create Date: 2026-07-24 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "008_annotation_landmarks"
down_revision = "007_audit_change_actions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "landmark_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("video_asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("processing_job_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="processing"),
        sa.Column("extractor", sa.String(), nullable=False, server_default="mediapipe_facemesh"),
        sa.Column("extractor_version", sa.String(), nullable=False),
        sa.Column("configuration", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("video_checksum", sa.String(), nullable=False),
        sa.Column("config_hash", sa.String(), nullable=False),
        sa.Column("fps", sa.Float(), nullable=False),
        sa.Column("frame_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("point_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("face_detection_rate", sa.Float(), nullable=False, server_default="0"),
        sa.Column("raw_uri", sa.String(), nullable=True),
        sa.Column("normalized_uri", sa.String(), nullable=True),
        sa.Column("overlay_prefix", sa.String(), nullable=True),
        sa.Column("raw_checksum", sa.String(), nullable=True),
        sa.Column("normalized_checksum", sa.String(), nullable=True),
        sa.Column("overlay_checksum", sa.String(), nullable=True),
        sa.Column("chunk_size_frames", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["processing_job_id"], ["processing_jobs.id"]),
        sa.ForeignKeyConstraint(["video_asset_id"], ["video_assets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "video_asset_id",
            "video_checksum",
            "config_hash",
            name="uq_landmark_artifact_input_config",
        ),
    )
    op.create_index(
        "ix_landmark_artifacts_video_status_created",
        "landmark_artifacts",
        ["video_asset_id", "status", "created_at"],
    )

    op.add_column("annotation_events", sa.Column("action_label", sa.String(), nullable=True))
    op.add_column(
        "annotation_events",
        sa.Column("kind", sa.String(), nullable=False, server_default="interval"),
    )
    op.add_column(
        "annotation_events",
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
    )
    op.add_column(
        "annotation_events",
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.execute("UPDATE annotation_events SET action_label = action WHERE action_label IS NULL")
    op.execute(
        """
        UPDATE annotation_events
        SET action = CASE
            WHEN action IN ('OF', 'OC', 'ML', 'VR') THEN action
            WHEN lower(trim(action)) IN (
                'olho fechado', 'olhos fechados', 'olho_fechado'
            ) THEN 'OF'
            WHEN lower(trim(action)) IN (
                'olhando para o lado', 'olhando para canto',
                'olhando_para_o_lado', 'olhando_para_canto'
            ) THEN 'OC'
            WHEN lower(trim(action)) IN (
                'mexeu lábios', 'mexeu labios', 'mexeu_labios'
            ) THEN 'ML'
            WHEN lower(trim(action)) IN (
                'virou rosto', 'virou_rosto'
            ) THEN 'VR'
            WHEN lower(trim(action)) = 'boca aberta' THEN 'BOCA_ABERTA'
            WHEN lower(trim(action)) = 'inclinado' THEN 'INCLINADO'
            WHEN lower(trim(action)) = 'movimento brusco' THEN 'MOVIMENTO_BRUSCO'
            ELSE 'CUSTOM_' || upper(regexp_replace(trim(action), '[^a-zA-Z0-9]+', '_', 'g'))
        END
        """
    )
    op.create_check_constraint(
        "ck_annotation_events_kind",
        "annotation_events",
        "kind IN ('interval', 'point')",
    )
    op.create_check_constraint(
        "ck_annotation_events_source",
        "annotation_events",
        "source IN ('manual', 'model_review')",
    )
    op.create_check_constraint(
        "ck_annotation_events_frame_range",
        "annotation_events",
        "(kind = 'point' AND start_frame = end_frame) OR "
        "(kind = 'interval' AND end_frame >= start_frame)",
    )

    op.create_table(
        "prediction_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("prediction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_event_key", sa.String(), nullable=False),
        sa.Column("decision", sa.String(), nullable=False),
        sa.Column("original_event", postgresql.JSONB(), nullable=False),
        sa.Column("annotation_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "decision IN ('accepted', 'corrected', 'rejected')",
            name="ck_prediction_reviews_decision",
        ),
        sa.ForeignKeyConstraint(["annotation_event_id"], ["annotation_events.id"]),
        sa.ForeignKeyConstraint(["prediction_id"], ["predictions.id"]),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["annotation_tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "task_id",
            "prediction_id",
            "model_event_key",
            name="uq_prediction_review_task_event",
        ),
    )


def downgrade() -> None:
    op.drop_table("prediction_reviews")
    op.drop_constraint("ck_annotation_events_frame_range", "annotation_events", type_="check")
    op.drop_constraint("ck_annotation_events_source", "annotation_events", type_="check")
    op.drop_constraint("ck_annotation_events_kind", "annotation_events", type_="check")
    op.drop_column("annotation_events", "updated_at")
    op.drop_column("annotation_events", "source")
    op.drop_column("annotation_events", "kind")
    op.drop_column("annotation_events", "action_label")
    op.drop_index(
        "ix_landmark_artifacts_video_status_created",
        table_name="landmark_artifacts",
    )
    op.drop_table("landmark_artifacts")
