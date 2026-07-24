from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.schemas.assessment import AssessmentCreate, Assessment
from app.db.models import LearningAssessment as AssessmentModel, User
from app.db.session import SessionLocal

router = APIRouter(prefix="/sessions", tags=["assessments"])

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_session

@router.post("/{session_id}/assessments", response_model=Assessment)
def create_assessment(
    session_id: UUID,
    assessment_in: AssessmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_session(db, current_user, session_id)
        
    db_obj = AssessmentModel(**assessment_in.model_dump())
    db_obj.session_id = session_id
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/{session_id}/assessments", response_model=List[Assessment])
def get_assessments(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_session(db, current_user, session_id)
    return db.query(AssessmentModel).filter(AssessmentModel.session_id == session_id).all()
