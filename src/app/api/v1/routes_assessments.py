from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.schemas.assessment import AssessmentCreate, Assessment
from app.db.models import LearningAssessment as AssessmentModel, Session as SessionModel
from app.db.session import SessionLocal

router = APIRouter(prefix="/sessions", tags=["assessments"])

from app.api.deps import get_db

@router.post("/{session_id}/assessments", response_model=Assessment)
def create_assessment(session_id: UUID, assessment_in: AssessmentCreate, db: Session = Depends(get_db)):
    session_obj = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")
        
    db_obj = AssessmentModel(**assessment_in.model_dump())
    db_obj.session_id = session_id
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/{session_id}/assessments", response_model=List[Assessment])
def get_assessments(session_id: UUID, db: Session = Depends(get_db)):
    return db.query(AssessmentModel).filter(AssessmentModel.session_id == session_id).all()
