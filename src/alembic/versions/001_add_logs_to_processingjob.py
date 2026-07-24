"""add_logs_to_processingjob

Revision ID: 001_add_logs_to_processingjob
Revises: 
Create Date: 2026-06-13 23:43:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_add_logs_to_processingjob'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('processing_jobs')]
    if 'logs' not in columns:
        op.add_column('processing_jobs', sa.Column('logs', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=True))

def downgrade():
    op.drop_column('processing_jobs', 'logs')
