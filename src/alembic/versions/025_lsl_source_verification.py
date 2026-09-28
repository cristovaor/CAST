"""Restore verification timestamps omitted from successfully imported XDFs.

Revision ID: 025_lsl_source_verification
Revises: 024_pupil_experiment
"""
from alembic import op
import sqlalchemy as sa

revision = "025_lsl_source_verification"
down_revision = "024_pupil_experiment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A ready recording and its immutable sync evidence are committed only
    # after downloading the XDF and verifying its SHA-256 and size. Restore
    # that historical verification, rather than approving arbitrary uploads.
    op.execute(sa.text("""
        UPDATE eeg_asset_files
        SET verified_at = (
            SELECT evidence.created_at
            FROM lsl_recordings AS recording
            JOIN sync_evidence AS evidence ON evidence.id = recording.sync_evidence_id
            WHERE recording.eeg_asset_id = eeg_asset_files.eeg_asset_id
        )
        WHERE verified_at IS NULL
          AND role = 'source'
          AND filename = 'recording.xdf'
          AND mime_type = 'application/x-xdf'
          AND is_primary = false
          AND EXISTS (
              SELECT 1
              FROM lsl_recordings AS recording
              JOIN eeg_assets AS asset ON asset.id = recording.eeg_asset_id
              JOIN sync_evidence AS evidence ON evidence.id = recording.sync_evidence_id
              WHERE recording.eeg_asset_id = eeg_asset_files.eeg_asset_id
                AND recording.status = 'ready'
                AND asset.eeg_format = 'XDF'
                AND asset.session_id = recording.session_id
                AND evidence.session_id = recording.session_id
                AND evidence.kind = 'lsl_xdf'
                AND evidence.checksum_sha256 = recording.checksum_sha256
                AND evidence.storage_uri = eeg_asset_files.storage_uri
                AND eeg_asset_files.storage_uri LIKE ('s3://%/' || recording.object_key)
                AND eeg_asset_files.checksum_sha256 = recording.checksum_sha256
                AND length(recording.checksum_sha256) = 64
                AND eeg_asset_files.size_bytes = recording.size_bytes
          )
    """))


def downgrade() -> None:
    # Verification is a historical fact; downgrading must not make these
    # successfully imported files pending again.
    pass
