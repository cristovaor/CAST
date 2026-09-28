"""Guard the single-head contract used by prestart.sh."""
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory


@pytest.fixture
def migration_history():
    backend_root = Path(__file__).resolve().parents[2]
    return ScriptDirectory.from_config(Config(str(backend_root / "alembic.ini")))


def test_startup_migration_history_has_one_head(migration_history):
    assert len(migration_history.get_heads()) == 1
    assert migration_history.get_revision("head") is not None


@pytest.mark.parametrize(
    ("current", "missing_parents"),
    [
        (
            "024_pupil_experiment",
            {"025_audit_logs_and_org_settings", "025_lsl_source_verification"},
        ),
        ("025_audit_logs_and_org_settings", {"025_lsl_source_verification"}),
        ("025_lsl_source_verification", {"025_audit_logs_and_org_settings"}),
        (("025_audit_logs_and_org_settings", "025_lsl_source_verification"), set()),
    ],
)
def test_upgrade_head_accepts_either_or_both_existing_branches(
    migration_history, current, missing_parents
):
    # This is the same planning operation used by alembic upgrade head.
    plan = migration_history._upgrade_revs("head", current)
    revisions = [step.revision.revision for step in plan]
    parents = {"025_audit_logs_and_org_settings", "025_lsl_source_verification"}
    assert set(revisions) & parents == missing_parents
    assert revisions[-1] == migration_history.get_current_head()
    assert len(revisions) == len(set(revisions))
