from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.schemas.participant import ParticipantCreate, Participant, ParticipantUpdate
from app.db.models import (
    AuditAction,
    AuditLog,
    Participant as ParticipantModel,
    ConsentStatus,
    User,
)
from app.services.audit_service import build_changes, record_audit
from app.db.session import SessionLocal

router = APIRouter(prefix="/participants", tags=["participants"])

from app.api.deps import get_db, get_current_user
from app.api.ownership import (
    get_participant,
    get_study,
    participants_for_user,
)

@router.get("/study/{study_id}", response_model=List[Participant])
def get_participants_by_study(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, study_id)
    return db.query(ParticipantModel).filter(ParticipantModel.study_id == study_id).all()

@router.post("/", response_model=Participant)
def create_participant(
    participant_in: ParticipantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, participant_in.study_id)
    db_obj = ParticipantModel(**participant_in.model_dump())
    db.add(db_obj)
    db.flush()
    record_audit(
        db,
        current_user,
        AuditAction.create,
        "participant",
        db_obj.id,
        snapshot={
            "study_id": db_obj.study_id,
            "external_code": db_obj.external_code,
            "demographic_group": db_obj.demographic_group,
            "consent_status": db_obj.consent_status,
        },
    )
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.patch("/{participant_id}", response_model=Participant)
def update_participant(
    participant_id: UUID,
    participant_in: ParticipantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_obj = get_participant(db, current_user, participant_id)
    update_data = participant_in.model_dump(exclude_unset=True)
    changes = build_changes(db_obj, update_data)
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    if changes:
        record_audit(
            db,
            current_user,
            AuditAction.update,
            "participant",
            db_obj.id,
            changes=changes,
        )
    db.commit()
    db.refresh(db_obj)
    return db_obj

from app.db.models import ConsentTerm
from pydantic import BaseModel
from fastapi import Request

class ConsentRequestPayload(BaseModel):
    status: ConsentStatus
    version: str = "1.0"

@router.post("/{participant_id}/consent", response_model=Participant)
def update_consent(
    participant_id: UUID, 
    payload: ConsentRequestPayload, 
    request: Request, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_obj = get_participant(db, current_user, participant_id)
        
    db_obj.consent_status = payload.status
    
    # Create Consent Term record for audit
    consent_term = ConsentTerm(
        participant_id=participant_id,
        version=payload.version,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    if payload.status == ConsentStatus.revoked:
        consent_term.revoked_at = __import__("datetime").datetime.utcnow()
        
    db.add(consent_term)
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        action=AuditAction.consent_change,
        actor_id=current_user.id,
        actor_label=current_user.email,
        entity_type="participant",
        entity_id=str(participant_id),
        detail={"new_status": payload.status.value, "version": payload.version},
    ))
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/", response_model=List[Participant])
def get_participants(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        participants_for_user(db, current_user)
        .offset(skip)
        .limit(limit)
        .all()
    )

import uuid
@router.post("/{participant_id}/deletion-request", status_code=202)
def request_deletion(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_obj = get_participant(db, current_user, participant_id)
    
    # Soft delete / revoke consent
    db_obj.consent_status = ConsentStatus.revoked
    db_obj.external_code = "DELETED_" + str(uuid.uuid4())[:8]
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        action=AuditAction.delete,
        actor_id=current_user.id,
        actor_label=current_user.email,
        entity_type="participant",
        entity_id=str(participant_id),
        justification="Participant deletion request",
    ))
    db.commit()
    
    return {"message": "Deletion request accepted and processing"}
