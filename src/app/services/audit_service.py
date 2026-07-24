import enum
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import AuditAction, AuditLog, User


def json_value(value: Any) -> Any:
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    return value


def build_changes(entity: Any, update_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    changes: dict[str, dict[str, Any]] = {}
    for field, new_value in update_data.items():
        old_value = getattr(entity, field)
        old_json = json_value(old_value)
        new_json = json_value(new_value)
        if old_json != new_json:
            changes[field] = {"from": old_json, "to": new_json}
    return changes


def record_audit(
    db: Session,
    actor: User,
    action: AuditAction,
    entity_type: str,
    entity_id: UUID | str,
    *,
    changes: dict[str, dict[str, Any]] | None = None,
    snapshot: dict[str, Any] | None = None,
    justification: str | None = None,
) -> AuditLog:
    detail: dict[str, Any] = {}
    if changes:
        detail["changes"] = json_value(changes)
    if snapshot:
        detail["snapshot"] = json_value(snapshot)

    audit = AuditLog(
        organization_id=actor.organization_id,
        action=action,
        actor_id=actor.id,
        actor_label=actor.email,
        entity_type=entity_type,
        entity_id=str(entity_id),
        justification=justification,
        detail=detail,
    )
    db.add(audit)
    return audit
