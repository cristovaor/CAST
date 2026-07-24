from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.schemas.participant import ParticipantCreate, Participant, ParticipantUpdate
from app.db.models import Participant as ParticipantModel, ConsentStatus
from app.db.session import SessionLocal

router = APIRouter(prefix="/participants", tags=["participants"])

from app.api.deps import get_db

@router.get("/study/{study_id}", response_model=List[Participant])
def get_participants_by_study(study_id: UUID, db: Session = Depends(get_db)):
    return db.query(ParticipantModel).filter(ParticipantModel.study_id == study_id).all()

@router.post("/", response_model=Participant)
def create_participant(participant_in: ParticipantCreate, db: Session = Depends(get_db)):
    db_obj = ParticipantModel(**participant_in.model_dump())
    db.add(db_obj)
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
    db: Session = Depends(get_db)
):
    db_obj = db.query(ParticipantModel).filter(ParticipantModel.id == participant_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Participant not found")
        
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
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/", response_model=List[Participant])
def get_participants(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(ParticipantModel).offset(skip).limit(limit).all()

import uuid
@router.post("/{participant_id}/deletion-request", status_code=202)
def request_deletion(participant_id: UUID, db: Session = Depends(get_db)):
    db_obj = db.query(ParticipantModel).filter(ParticipantModel.id == participant_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Participant not found")
    
    # Soft delete / revoke consent
    db_obj.consent_status = ConsentStatus.revoked
    db_obj.external_code = "DELETED_" + str(uuid.uuid4())[:8]
    db.commit()
    
    return {"message": "Deletion request accepted and processing"}
