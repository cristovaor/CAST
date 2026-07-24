"""multimodal entities: session state, EEG quality, sync, datasets, variables, audit

Revision ID: 002_multimodal_entities
Revises: 001_add_logs_to_processingjob
Create Date: 2026-07-20 04:00:00.000000

Adds the multimodal research surface (docs §8–21): session state/metadata,
rich EEG metadata + quality, video quality, synchronization, research variables,
datasets and the governance audit log. Written defensively so it is safe to run
against a database created before these entities existed.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '002_multimodal_entities'
down_revision = '001_add_logs_to_processingjob'
branch_labels = None
depends_on = None


SESSION_STATE = sa.Enum(
    'draft', 'awaiting_data', 'incomplete', 'ready_to_sync', 'syncing', 'synced',
    'processing', 'processed', 'review_required', 'approved', 'excluded', 'archived',
    name='sessionstate',
)
QUALITY_VERDICT = sa.Enum(
    'approved', 'approved_with_caveats', 'review_required', 'rejected',
    name='qualityverdict',
)
SYNC_STATE = sa.Enum(
    'not_synced', 'auto_available', 'in_review', 'synced', 'synced_with_caveats', 'sync_failed',
    name='syncstate',
)
DATASET_STATE = sa.Enum(
    'draft', 'building', 'validating', 'frozen', 'published_internal', 'superseded', 'archived',
    name='datasetstate',
)
AUDIT_ACTION = sa.Enum(
    'access', 'export', 'consent_change', 'grant', 'delete', 'sync_decision', 'dataset_freeze',
    name='auditaction',
)


def _cols(inspector, table):
    return {c['name'] for c in inspector.get_columns(table)}


def _has_table(inspector, table):
    return table in inspector.get_table_names()


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    jsonb = postgresql.JSONB(astext_type=sa.Text())

    # Enum types (create if missing).
    for enum in (SESSION_STATE, QUALITY_VERDICT, SYNC_STATE, DATASET_STATE, AUDIT_ACTION):
        enum.create(conn, checkfirst=True)

    # Extend the JobType enum with new values (Postgres ALTER TYPE ... ADD VALUE).
    for value in ('quality_check', 'eeg_quality', 'sync', 'dataset_build'):
        conn.execute(sa.text(f"ALTER TYPE jobtype ADD VALUE IF NOT EXISTS '{value}'"))

    # ── studies configurable design (docs §3, §7) ───────────────
    study_cols = _cols(inspector, 'studies')
    if 'config' not in study_cols:
        op.add_column('studies', sa.Column('config', jsonb, server_default='{}', nullable=True))

    # ── sessions ────────────────────────────────────────────────
    session_cols = _cols(inspector, 'sessions')
    if 'state' not in session_cols:
        op.add_column('sessions', sa.Column('state', SESSION_STATE, server_default='draft', nullable=True))
    for name, col in [
        ('condition', sa.Column('condition', sa.String(), nullable=True)),
        ('protocol', sa.Column('protocol', sa.String(), nullable=True)),
        ('operator', sa.Column('operator', sa.String(), nullable=True)),
        ('recorded_at', sa.Column('recorded_at', sa.DateTime(), nullable=True)),
        ('duration_seconds', sa.Column('duration_seconds', sa.Numeric(), nullable=True)),
        ('notes', sa.Column('notes', sa.Text(), nullable=True)),
    ]:
        if name not in session_cols:
            op.add_column('sessions', col)

    # ── video_assets quality ────────────────────────────────────
    va_cols = _cols(inspector, 'video_assets')
    if 'quality_verdict' not in va_cols:
        op.add_column('video_assets', sa.Column('quality_verdict', QUALITY_VERDICT, nullable=True))
    if 'quality_report' not in va_cols:
        op.add_column('video_assets', sa.Column('quality_report', jsonb, server_default='{}', nullable=True))

    # ── eeg_assets rich metadata + quality ──────────────────────
    eeg_cols = _cols(inspector, 'eeg_assets')
    eeg_new = [
        ('eeg_format', sa.Column('eeg_format', sa.String(), nullable=True)),
        ('device', sa.Column('device', sa.String(), nullable=True)),
        ('manufacturer', sa.Column('manufacturer', sa.String(), nullable=True)),
        ('model', sa.Column('model', sa.String(), nullable=True)),
        ('channel_count', sa.Column('channel_count', sa.Integer(), nullable=True)),
        ('channel_names', sa.Column('channel_names', jsonb, server_default='[]', nullable=True)),
        ('montage', sa.Column('montage', sa.String(), nullable=True)),
        ('reference', sa.Column('reference', sa.String(), nullable=True)),
        ('resolution_bits', sa.Column('resolution_bits', sa.Integer(), nullable=True)),
        ('units', sa.Column('units', sa.String(), nullable=True)),
        ('duration_seconds', sa.Column('duration_seconds', sa.Numeric(), nullable=True)),
        ('start_timestamp', sa.Column('start_timestamp', sa.DateTime(), nullable=True)),
        ('event_count', sa.Column('event_count', sa.Integer(), nullable=True)),
        ('quality_verdict', sa.Column('quality_verdict', QUALITY_VERDICT, nullable=True)),
        ('valid_ratio', sa.Column('valid_ratio', sa.Float(), nullable=True)),
        ('channel_quality', sa.Column('channel_quality', jsonb, server_default='[]', nullable=True)),
        ('quality_findings', sa.Column('quality_findings', jsonb, server_default='[]', nullable=True)),
        ('quality_criteria', sa.Column('quality_criteria', jsonb, server_default='[]', nullable=True)),
    ]
    for name, col in eeg_new:
        if name not in eeg_cols:
            op.add_column('eeg_assets', col)

    # ── synchronizations ────────────────────────────────────────
    if not _has_table(inspector, 'synchronizations'):
        op.create_table(
            'synchronizations',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('sessions.id'), unique=True),
            sa.Column('state', SYNC_STATE, server_default='not_synced'),
            sa.Column('method', sa.String()),
            sa.Column('offset_ms', sa.Integer(), server_default='0'),
            sa.Column('drift_ms_per_min', sa.Float()),
            sa.Column('confidence', sa.Float()),
            sa.Column('anchors', jsonb, server_default='[]'),
            sa.Column('history', jsonb, server_default='[]'),
            sa.Column('justification', sa.Text()),
            sa.Column('approved_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('approved_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime()),
            sa.Column('updated_at', sa.DateTime()),
        )

    # ── research_variables ──────────────────────────────────────
    if not _has_table(inspector, 'research_variables'):
        op.create_table(
            'research_variables',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('study_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('studies.id'), index=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('code', sa.String(), nullable=False),
            sa.Column('description', sa.Text()),
            sa.Column('var_type', sa.String()),
            sa.Column('unit', sa.String()),
            sa.Column('domain', sa.String()),
            sa.Column('origin', sa.String()),
            sa.Column('granularity', sa.String()),
            sa.Column('modality', sa.String()),
            sa.Column('computation_method', sa.Text()),
            sa.Column('version', sa.String()),
            sa.Column('missing_policy', sa.String()),
            sa.Column('allowed_values', jsonb, server_default='[]'),
            sa.Column('role', sa.String()),
            sa.Column('owner', sa.String()),
            sa.Column('validation_status', sa.String(), server_default='draft'),
            sa.Column('created_at', sa.DateTime()),
        )

    # ── datasets ────────────────────────────────────────────────
    if not _has_table(inspector, 'datasets'):
        op.create_table(
            'datasets',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('dataset_version', sa.String(), nullable=False),
            sa.Column('level', sa.String()),
            sa.Column('state', DATASET_STATE, server_default='draft'),
            sa.Column('manifest', jsonb, server_default='{}'),
            sa.Column('participant_count', sa.Integer(), server_default='0'),
            sa.Column('session_count', sa.Integer(), server_default='0'),
            sa.Column('checksum', sa.String()),
            sa.Column('storage_uri', sa.String()),
            sa.Column('owner', sa.String()),
            sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('build_criteria', jsonb, server_default='{}'),
            sa.Column('build_status', sa.String(), server_default='draft'),
            sa.Column('build_error', sa.Text()),
            sa.Column('included_session_ids', jsonb, server_default='[]'),
            sa.Column('excluded_sessions', jsonb, server_default='[]'),
            sa.Column('lineage', jsonb, server_default='{}'),
            sa.Column('created_at', sa.DateTime()),
            sa.Column('built_at', sa.DateTime(), nullable=True),
            sa.Column('frozen_at', sa.DateTime(), nullable=True),
        )
    else:
        # Table pre-existed (created by an earlier partial run) — add build cols.
        ds_cols = _cols(inspector, 'datasets')
        for name, col in [
            ('build_criteria', sa.Column('build_criteria', jsonb, server_default='{}')),
            ('build_status', sa.Column('build_status', sa.String(), server_default='draft')),
            ('build_error', sa.Column('build_error', sa.Text())),
            ('included_session_ids', sa.Column('included_session_ids', jsonb, server_default='[]')),
            ('excluded_sessions', sa.Column('excluded_sessions', jsonb, server_default='[]')),
            ('lineage', sa.Column('lineage', jsonb, server_default='{}')),
            ('built_at', sa.Column('built_at', sa.DateTime(), nullable=True)),
        ]:
            if name not in ds_cols:
                op.add_column('datasets', col)

    # ── audit_logs ──────────────────────────────────────────────
    if not _has_table(inspector, 'audit_logs'):
        op.create_table(
            'audit_logs',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('action', AUDIT_ACTION, index=True),
            sa.Column('actor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('actor_label', sa.String()),
            sa.Column('entity_type', sa.String()),
            sa.Column('entity_id', sa.String()),
            sa.Column('justification', sa.Text()),
            sa.Column('detail', jsonb, server_default='{}'),
            sa.Column('created_at', sa.DateTime(), index=True),
        )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    for table in ('audit_logs', 'datasets', 'research_variables', 'synchronizations'):
        if _has_table(inspector, table):
            op.drop_table(table)

    eeg_cols = _cols(inspector, 'eeg_assets')
    for name in [
        'eeg_format', 'device', 'manufacturer', 'model', 'channel_count',
        'channel_names', 'montage', 'reference', 'resolution_bits', 'units',
        'duration_seconds', 'start_timestamp', 'event_count', 'quality_verdict',
        'valid_ratio', 'channel_quality', 'quality_findings', 'quality_criteria',
    ]:
        if name in eeg_cols:
            op.drop_column('eeg_assets', name)

    va_cols = _cols(inspector, 'video_assets')
    for name in ['quality_verdict', 'quality_report']:
        if name in va_cols:
            op.drop_column('video_assets', name)

    session_cols = _cols(inspector, 'sessions')
    for name in ['state', 'condition', 'protocol', 'operator', 'recorded_at', 'duration_seconds', 'notes']:
        if name in session_cols:
            op.drop_column('sessions', name)

    if 'config' in _cols(inspector, 'studies'):
        op.drop_column('studies', 'config')

    for enum_name in ('sessionstate', 'qualityverdict', 'syncstate', 'datasetstate', 'auditaction'):
        conn.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name}"))
