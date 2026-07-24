from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List
from pydantic import BaseModel

from app.db.models import ConsentTerm, Participant
from app.api.deps import get_db

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

@router.get("/consents", response_model=List[AuditLogResponse])
def get_consent_audit_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    logs = (
        db.query(ConsentTerm, Participant.external_code, Participant.study_id)
        .join(Participant, ConsentTerm.participant_id == Participant.id)
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
