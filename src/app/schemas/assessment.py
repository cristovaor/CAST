from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from app.db.models import AssessmentType

class AssessmentBase(BaseModel):
    type: AssessmentType
    score: float
    max_score: float
    metadata_info: Optional[Dict[str, Any]] = None

class AssessmentCreate(AssessmentBase):
    pass

class AssessmentInDBBase(AssessmentBase):
    id: UUID
    session_id: UUID
    model_config = ConfigDict(from_attributes=True)

class Assessment(AssessmentInDBBase):
    pass
