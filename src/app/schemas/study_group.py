from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


GroupRole = Literal["control", "intervention", "comparison", "other"]


class StudyGroupCreate(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    role: GroupRole = "other"
    description: Optional[str] = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        normalized = "_".join(value.strip().lower().split())
        if not normalized:
            raise ValueError("Group code cannot be empty")
        return normalized

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class StudyGroupUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=80)
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    role: Optional[GroupRole] = None
    description: Optional[str] = None


class StudyGroupDetail(StudyGroupCreate):
    id: UUID
    study_id: UUID
    participant_count: int = 0
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
