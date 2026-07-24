from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from app.db.models import StudyStatus

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    organization_id: Optional[UUID] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[StudyStatus] = None

class ProjectInDBBase(ProjectBase):
    id: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class Project(ProjectInDBBase):
    pass

class ProjectResponsible(BaseModel):
    id: UUID
    name: str
    avatar_url: Optional[str] = None

class ProjectDetail(Project):
    study_count: int = 0
    session_count: int = 0
    video_count: int = 0
    average_quality: float = 0.0
    status: StudyStatus = StudyStatus.draft
    last_activity: Optional[datetime] = None
    responsible: List[ProjectResponsible] = []
