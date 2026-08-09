"""Face Landmarker v2 artifact capabilities.

Revision ID: 021_face_landmarker_v2
Revises: 020_experimental_context
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "021_face_landmarker_v2"
down_revision = "020_experimental_context"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("landmark_artifacts", sa.Column("capabilities", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("landmark_artifacts", sa.Column("features_uri", sa.String()))
    op.add_column("landmark_artifacts", sa.Column("features_checksum", sa.String()))
    op.add_column("landmark_artifacts", sa.Column("quality_uri", sa.String()))
    op.add_column("landmark_artifacts", sa.Column("quality_checksum", sa.String()))
    op.add_column("landmark_artifacts", sa.Column("model_uri", sa.String()))
    op.add_column("landmark_artifacts", sa.Column("model_checksum", sa.String()))


def downgrade() -> None:
    op.drop_column("landmark_artifacts", "model_checksum")
    op.drop_column("landmark_artifacts", "model_uri")
    op.drop_column("landmark_artifacts", "quality_checksum")
    op.drop_column("landmark_artifacts", "quality_uri")
    op.drop_column("landmark_artifacts", "features_checksum")
    op.drop_column("landmark_artifacts", "features_uri")
    op.drop_column("landmark_artifacts", "capabilities")
