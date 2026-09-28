"""Shared plumbing for the permanent-deletion endpoints.

Routes resolve the entity (ownership + role checks) and hand over its label
and confirmation phrase; this module previews, deletes, audits and schedules
the object-storage purge.
"""
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import User
from app.schemas.deletion import DeletionImpact, DeletionRequest
from app.services.deletion_service import (
    DeletionBlockedError,
    delete_entity,
    plan_deletion,
    purge_storage,
)
from app.services.storage_service import storage_service


def short_id(entity_id: UUID) -> str:
    """Confirmation phrase for entities without a human-readable name."""
    return str(entity_id)[:8]


def deletion_impact(
    db: Session,
    entity_type: str,
    entity_id: UUID,
    *,
    label: str,
    confirmation_phrase: str,
) -> DeletionImpact:
    plan = plan_deletion(db, entity_type, entity_id, bucket=storage_service.bucket_name)
    return DeletionImpact(
        entity_type=entity_type,
        entity_id=entity_id,
        label=label,
        confirmation_phrase=confirmation_phrase,
        counts=plan.counts(),
        detached={
            f"{table}.{column}": len(ids) for (table, column), ids in plan.nullify.items()
        },
        storage_objects=len(plan.storage_keys) + len(plan.storage_prefixes),
        active_jobs=plan.active_jobs,
        can_delete=plan.active_jobs == 0,
    )


def perform_deletion(
    db: Session,
    actor: User,
    entity_type: str,
    entity_id: UUID,
    payload: DeletionRequest,
    background_tasks: BackgroundTasks,
    *,
    label: str,
    confirmation_phrase: str,
) -> None:
    if payload.confirmation.strip() != confirmation_phrase.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Confirmation text does not match",
        )
    try:
        plan = delete_entity(
            db,
            actor,
            entity_type,
            entity_id,
            label=label,
            justification=payload.justification.strip(),
            bucket=storage_service.bucket_name,
        )
    except DeletionBlockedError as error:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    background_tasks.add_task(
        purge_storage, set(plan.storage_keys), set(plan.storage_prefixes)
    )
