from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from app.db.models import ConsentStatus

class ParticipantBase(BaseModel):
    study_id: UUID
    external_code: str
    demographic_group: Optional[Dict[str, Any]] = None

class ParticipantCreate(ParticipantBase):
    pass

class ParticipantUpdate(BaseModel):
    external_code: Optional[str] = None
    demographic_group: Optional[Dict[str, Any]] = None
    consent_status: Optional[ConsentStatus] = None

class ParticipantInDBBase(ParticipantBase):
    id: UUID
    consent_status: ConsentStatus
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class Participant(ParticipantInDBBase):
    pass
