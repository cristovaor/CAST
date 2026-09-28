"""Permanent deletion of a research entity and everything that hangs off it.

The dependency graph is read from Base.metadata instead of being hand-listed,
so a new table that references a session or video is covered automatically.
Every row whose foreign key points into the deleted set is deleted too, except
where the schema declares ON DELETE SET NULL: those rows outlive the parent
(e.g. a study report keeps existing after one participant is erased) and only
lose the reference.

Object storage is purged after the database commit, best effort: a leftover
object is harmless, a row pointing at a missing object is not.
"""
from __future__ import annotations

import logging
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Iterable
from uuid import UUID

from sqlalchemy import Table, delete, select, update
from sqlalchemy.orm import Session

import app.db.base  # noqa: F401  (registers every model on Base.metadata)
from app.db.base_class import Base
from app.db.models import AuditAction, JobStatus, User
from app.services.audit_service import record_audit

logger = logging.getLogger(__name__)

ENTITY_TABLES = {
    "project": "projects",
    "study": "studies",
    "participant": "participants",
    "session": "sessions",
    "video": "video_assets",
}

# Declared SET NULL, but the row only exists because of the parent: a finished
# capture run left without its video would still block a new capture.
CASCADE_OVERRIDES = {("video_capture_runs", "video_asset_id")}

# Columns holding "s3://<bucket>/<key>" URIs or bare object keys.
STORAGE_OBJECT_COLUMNS = {
    "storage_uri",
    "raw_uri",
    "derived_uri",
    "normalized_uri",
    "features_uri",
    "quality_uri",
    "prediction_uri",
    "input_uri",
    "pts_uri",
    "object_key",
}
# Columns holding a key prefix with many objects below it.
STORAGE_PREFIX_COLUMNS = {"overlay_prefix"}

ACTIVE_JOB_STATUSES = (JobStatus.queued, JobStatus.running)
_CHUNK = 500


class DeletionBlockedError(Exception):
    pass


@dataclass
class DeletionPlan:
    entity_type: str
    entity_id: UUID
    rows: dict[str, set[Any]] = field(default_factory=dict)
    nullify: dict[tuple[str, str], set[Any]] = field(default_factory=dict)
    storage_keys: set[str] = field(default_factory=set)
    storage_prefixes: set[str] = field(default_factory=set)
    active_jobs: int = 0

    def counts(self) -> dict[str, int]:
        return {table: len(ids) for table, ids in sorted(self.rows.items()) if ids}


def _chunks(values: Iterable[Any]) -> Iterable[list[Any]]:
    items = list(values)
    for start in range(0, len(items), _CHUNK):
        yield items[start : start + _CHUNK]


def _pk(table: Table):
    (column,) = table.primary_key.columns
    return column


def _referencing(table_name: str) -> list[tuple[Table, Any]]:
    refs = []
    for table in Base.metadata.sorted_tables:
        for fk in table.foreign_keys:
            if fk.column.table.name == table_name:
                refs.append((table, fk))
    return refs


def _object_key(value: str, bucket: str) -> str | None:
    if value.startswith("s3://"):
        prefix = f"s3://{bucket}/"
        return value[len(prefix):] if value.startswith(prefix) else None
    # Bare keys never contain a scheme; anything else (local paths) is skipped.
    return None if "://" in value or value.startswith("/") else value


def _collect_storage(db: Session, plan: DeletionPlan, bucket: str) -> None:
    for table_name, ids in plan.rows.items():
        table = Base.metadata.tables[table_name]
        object_cols = [c for c in table.columns if c.name in STORAGE_OBJECT_COLUMNS]
        prefix_cols = [c for c in table.columns if c.name in STORAGE_PREFIX_COLUMNS]
        if not (object_cols or prefix_cols):
            continue
        for chunk in _chunks(ids):
            result = db.execute(
                select(*object_cols, *prefix_cols).where(_pk(table).in_(chunk))
            )
            for row in result:
                values = list(row)
                for value in values[: len(object_cols)]:
                    if isinstance(value, str) and value:
                        key = _object_key(value, bucket)
                        if key:
                            plan.storage_keys.add(key)
                for value in values[len(object_cols):]:
                    if isinstance(value, str) and value:
                        key = _object_key(value, bucket)
                        if key:
                            plan.storage_prefixes.add(key.rstrip("/") + "/")


def plan_deletion(
    db: Session,
    entity_type: str,
    entity_id: UUID,
    *,
    bucket: str = "cast-videos",
) -> DeletionPlan:
    """Walks the foreign-key graph down from one entity without changing data."""
    root_table = ENTITY_TABLES[entity_type]
    plan = DeletionPlan(entity_type=entity_type, entity_id=entity_id)
    rows: dict[str, set[Any]] = defaultdict(set)
    nullify: dict[tuple[str, str], set[Any]] = defaultdict(set)

    pending: deque[tuple[str, set[Any]]] = deque([(root_table, {entity_id})])
    while pending:
        table_name, ids = pending.popleft()
        new_ids = ids - rows[table_name]
        if not new_ids:
            continue
        rows[table_name] |= new_ids
        for child, fk in _referencing(table_name):
            column = fk.parent
            found: set[Any] = set()
            for chunk in _chunks(new_ids):
                found.update(
                    db.execute(select(_pk(child)).where(column.in_(chunk))).scalars()
                )
            if not found:
                continue
            if (
                fk.ondelete == "SET NULL"
                and (child.name, column.name) not in CASCADE_OVERRIDES
            ):
                nullify[(child.name, column.name)] |= found
            else:
                pending.append((child.name, found))

    plan.rows = {name: ids for name, ids in rows.items() if ids}
    plan.nullify = {
        key: ids - plan.rows.get(key[0], set())
        for key, ids in nullify.items()
        if ids - plan.rows.get(key[0], set())
    }

    job_ids = plan.rows.get("processing_jobs")
    if job_ids:
        jobs = Base.metadata.tables["processing_jobs"]
        for chunk in _chunks(job_ids):
            plan.active_jobs += len(
                db.execute(
                    select(jobs.c.id).where(
                        jobs.c.id.in_(chunk),
                        jobs.c.status.in_(ACTIVE_JOB_STATUSES),
                    )
                ).all()
            )

    _collect_storage(db, plan, bucket)
    return plan


def execute_deletion(db: Session, plan: DeletionPlan) -> None:
    """Applies a plan inside the caller's transaction (no commit)."""
    for (table_name, column_name), ids in plan.nullify.items():
        table = Base.metadata.tables[table_name]
        for chunk in _chunks(ids):
            db.execute(
                update(table).where(_pk(table).in_(chunk)).values({column_name: None})
            )
    # sorted_tables lists parents before children; delete children first.
    for table in reversed(Base.metadata.sorted_tables):
        ids = plan.rows.get(table.name)
        if not ids:
            continue
        for chunk in _chunks(ids):
            db.execute(delete(table).where(_pk(table).in_(chunk)))
    db.expire_all()


def delete_entity(
    db: Session,
    actor: User,
    entity_type: str,
    entity_id: UUID,
    *,
    label: str,
    justification: str,
    bucket: str = "cast-videos",
) -> DeletionPlan:
    """Plans, audits and deletes one entity, then commits."""
    plan = plan_deletion(db, entity_type, entity_id, bucket=bucket)
    if plan.active_jobs:
        raise DeletionBlockedError(
            f"{plan.active_jobs} processing job(s) still queued or running; "
            "cancel them or wait for them to finish"
        )
    record_audit(
        db,
        actor,
        AuditAction.delete,
        entity_type,
        entity_id,
        snapshot={
            "label": label,
            "cascade": plan.counts(),
            "detached": {
                f"{table}.{column}": len(ids)
                for (table, column), ids in plan.nullify.items()
            },
            "storage_objects": len(plan.storage_keys),
            "storage_prefixes": sorted(plan.storage_prefixes),
        },
        justification=justification,
    )
    execute_deletion(db, plan)
    db.commit()
    return plan


def purge_storage(keys: Iterable[str], prefixes: Iterable[str]) -> None:
    """Deletes objects after the rows are gone. Never raises."""
    try:
        from app.services.storage_service import storage_service

        failed = storage_service.delete_objects(list(keys))
        for prefix in prefixes:
            failed += storage_service.delete_prefix(prefix)
        if failed:
            logger.warning("Storage purge left %d object(s) behind", failed)
    except Exception:  # pragma: no cover - storage outage must not surface
        logger.exception("Storage purge failed")
