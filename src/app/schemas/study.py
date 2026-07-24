from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from datetime import datetime
from app.db.models import StudyStatus

class StudyBase(BaseModel):
    name: str
    description: Optional[str] = None
    # Optional so a study can be drafted before being attached to a project.
    project_id: Optional[UUID] = None
    protocol_version: Optional[str] = None
    # Configurable scientific design (docs §3, §7) — see Study.config.
    config: Dict[str, Any] = Field(default_factory=dict)

class StudyCreate(StudyBase):
    pass

class StudyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[StudyStatus] = None
    protocol_version: Optional[str] = None
    config: Optional[Dict[str, Any]] = None

class StudyInDBBase(StudyBase):
    id: UUID
    status: StudyStatus
    created_by: Optional[UUID] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class Study(StudyInDBBase):
    pass
