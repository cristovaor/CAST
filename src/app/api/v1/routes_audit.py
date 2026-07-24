from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List
from pydantic import BaseModel, Field

from app.db.models import AuditLog, ConsentTerm, Participant, Project, Study, User
from app.api.deps import get_db, get_current_user

router = APIRouter(prefix="/audit", tags=["audit"])

class AuditLogResponse(BaseModel):
    id: UUID
    participant_id: UUID
    participant_code: str
    study_id: UUID
    version: str
    accepted_at: str
    revoked_at: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None


class ChangeHistoryResponse(BaseModel):
    id: UUID
    action: str
    actor_id: UUID | None = None
    actor_label: str | None = None
    entity_type: str
    entity_id: str
    justification: str | None = None
    detail: dict = Field(default_factory=dict)
    created_at: str


@router.get("/history", response_model=List[ChangeHistoryResponse])
def get_change_history(
    entity_type: str | None = None,
    entity_id: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AuditLog).filter(AuditLog.organization_id == current_user.organization_id)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    logs = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    return [
        ChangeHistoryResponse(
            id=log.id,
            action=log.action.value,
            actor_id=log.actor_id,
            actor_label=log.actor_label,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            justification=log.justification,
            detail=log.detail or {},
            created_at=log.created_at.isoformat(),
        )
        for log in logs
    ]

@router.get("/consents", response_model=List[AuditLogResponse])
def get_consent_audit_logs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = (
        db.query(ConsentTerm, Participant.external_code, Participant.study_id)
        .join(Participant, ConsentTerm.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == current_user.organization_id)
        .order_by(ConsentTerm.accepted_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return [
        AuditLogResponse(
            id=log.ConsentTerm.id,
            participant_id=log.ConsentTerm.participant_id,
            participant_code=log.external_code,
            study_id=log.study_id,
            version=log.ConsentTerm.version,
            accepted_at=log.ConsentTerm.accepted_at.isoformat() if log.ConsentTerm.accepted_at else "",
            revoked_at=log.ConsentTerm.revoked_at.isoformat() if log.ConsentTerm.revoked_at else None,
            ip_address=log.ConsentTerm.ip_address,
            user_agent=log.ConsentTerm.user_agent
        ) for log in logs
    ]
