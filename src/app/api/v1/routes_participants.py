from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import UTC, datetime
from typing import List
from uuid import UUID

from app.schemas.participant import (
    ParticipantCreate,
    Participant,
    ParticipantDeactivation,
    ParticipantUpdate,
)
from app.db.models import (
    AuditAction,
    AuditLog,
    Participant as ParticipantModel,
    StudyGroup,
    ConsentTerm,
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


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)

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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, participant_in.study_id)
    if participant_in.group_id:
        valid_group = (
            db.query(StudyGroup)
            .filter(
                StudyGroup.id == participant_in.group_id,
                StudyGroup.study_id == participant_in.study_id,
            )
            .first()
        )
        if not valid_group:
            raise HTTPException(status_code=422, detail="Group does not belong to study")
    existing = (
        db.query(ParticipantModel)
        .filter(
            ParticipantModel.study_id == participant_in.study_id,
            func.lower(ParticipantModel.external_code)
            == participant_in.external_code.lower(),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Participant code already exists in this study",
        )

    db_obj = ParticipantModel(
        **participant_in.model_dump(exclude={"consent_version"})
    )
    db.add(db_obj)
    db.flush()
    if participant_in.consent_status == ConsentStatus.accepted:
        db.add(
            ConsentTerm(
                participant_id=db_obj.id,
                version=participant_in.consent_version,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
        )
        db.add(
            AuditLog(
                organization_id=current_user.organization_id,
                action=AuditAction.consent_change,
                actor_id=current_user.id,
                actor_label=current_user.email,
                entity_type="participant",
                entity_id=str(db_obj.id),
                detail={
                    "new_status": ConsentStatus.accepted.value,
                    "version": participant_in.consent_version,
                    "source": "enrollment",
                },
            )
        )
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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_obj = get_participant(db, current_user, participant_id)
    update_data = participant_in.model_dump(exclude_unset=True)
    consent_version = update_data.pop("consent_version", None)

    if "external_code" in update_data:
        if update_data["external_code"] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Participant code cannot be null",
            )
        existing = (
            db.query(ParticipantModel)
            .filter(
                ParticipantModel.study_id == db_obj.study_id,
                ParticipantModel.id != db_obj.id,
                func.lower(ParticipantModel.external_code)
                == update_data["external_code"].lower(),
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Participant code already exists in this study",
            )
    if "group_id" in update_data and update_data["group_id"] is not None:
        valid_group = (
            db.query(StudyGroup)
            .filter(
                StudyGroup.id == update_data["group_id"],
                StudyGroup.study_id == db_obj.study_id,
            )
            .first()
        )
        if not valid_group:
            raise HTTPException(status_code=422, detail="Group does not belong to study")
    changes = build_changes(db_obj, update_data)
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    if "consent_status" in update_data:
        new_status = update_data["consent_status"]
        if new_status in {ConsentStatus.accepted, ConsentStatus.revoked}:
            consent_term = ConsentTerm(
                participant_id=db_obj.id,
                version=consent_version,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
            if new_status == ConsentStatus.revoked:
                consent_term.revoked_at = _utcnow()
            db.add(consent_term)
        db.add(
            AuditLog(
                organization_id=current_user.organization_id,
                action=AuditAction.consent_change,
                actor_id=current_user.id,
                actor_label=current_user.email,
                entity_type="participant",
                entity_id=str(db_obj.id),
                detail={
                    "previous_status": changes.get("consent_status", {}).get("from"),
                    "new_status": new_status.value,
                    "version": consent_version,
                    "source": "participant_edit",
                },
            )
        )

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


@router.post("/{participant_id}/deactivate", response_model=Participant)
def deactivate_participant(
    participant_id: UUID,
    payload: ParticipantDeactivation,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_obj = get_participant(db, current_user, participant_id)
    if not db_obj.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Participant is already inactive",
        )

    deactivated_at = _utcnow()
    update_data = {
        "is_active": False,
        "deactivated_at": deactivated_at,
        "deactivation_reason": payload.reason,
    }
    changes = build_changes(db_obj, update_data)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    record_audit(
        db,
        current_user,
        AuditAction.update,
        "participant",
        db_obj.id,
        changes=changes,
        justification=payload.reason,
    )
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.post("/{participant_id}/activate", response_model=Participant)
def activate_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_obj = get_participant(db, current_user, participant_id)
    if db_obj.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Participant is already active",
        )

    update_data = {
        "is_active": True,
        "deactivated_at": None,
        "deactivation_reason": None,
    }
    changes = build_changes(db_obj, update_data)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    record_audit(
        db,
        current_user,
        AuditAction.update,
        "participant",
        db_obj.id,
        changes=changes,
        justification="Participant reactivated for continued study participation",
    )
    db.commit()
    db.refresh(db_obj)
    return db_obj

from pydantic import BaseModel

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
        consent_term.revoked_at = _utcnow()
        
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
