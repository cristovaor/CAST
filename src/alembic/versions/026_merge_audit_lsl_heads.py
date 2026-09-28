"""Merge the audit and LSL verification migration branches.

Revision ID: 026_merge_audit_lsl_heads
Revises: 025_audit_logs_and_org_settings, 025_lsl_source_verification
"""

revision = "026_merge_audit_lsl_heads"
down_revision = (
    "025_audit_logs_and_org_settings",
    "025_lsl_source_verification",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Both parent migrations run before this history-only merge.
    pass


def downgrade() -> None:
    # Returning to the parent heads requires no schema changes.
    pass
