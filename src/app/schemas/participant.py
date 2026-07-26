from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from uuid import UUID
from datetime import datetime
from app.db.models import ConsentStatus

class ParticipantBase(BaseModel):
    study_id: UUID
    group_id: Optional[UUID] = None
    external_code: str = Field(min_length=2, max_length=80)
    demographic_group: Optional[Dict[str, Any]] = None

    @field_validator("external_code", mode="before")
    @classmethod
    def normalize_external_code(cls, value: Any) -> Any:
        return value.strip().upper() if isinstance(value, str) else value

class ParticipantCreate(ParticipantBase):
    consent_status: ConsentStatus = ConsentStatus.pending
    consent_version: Optional[str] = Field(default=None, max_length=80)

    @field_validator("consent_version")
    @classmethod
    def normalize_consent_version(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_enrollment_consent(self):
        if self.consent_status == ConsentStatus.revoked:
            raise ValueError("A new participant cannot start with revoked consent")
        if self.consent_status == ConsentStatus.accepted and not self.consent_version:
            raise ValueError("consent_version is required when consent is accepted")
        return self

class ParticipantUpdate(BaseModel):
    external_code: Optional[str] = Field(default=None, min_length=2, max_length=80)
    group_id: Optional[UUID] = None
    demographic_group: Optional[Dict[str, Any]] = None
    consent_status: Optional[ConsentStatus] = None
    consent_version: Optional[str] = Field(default=None, max_length=80)

    @field_validator("external_code", mode="before")
    @classmethod
    def normalize_external_code(cls, value: Any) -> Any:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("consent_version")
    @classmethod
    def normalize_consent_version(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_consent_change(self):
        if (
            self.consent_status in {ConsentStatus.accepted, ConsentStatus.revoked}
            and not self.consent_version
        ):
            raise ValueError(
                "consent_version is required when consent is accepted or revoked"
            )
        return self


class ParticipantDeactivation(BaseModel):
    reason: str = Field(min_length=10, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def normalize_reason(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

class ParticipantInDBBase(ParticipantBase):
    id: UUID
    consent_status: ConsentStatus
    is_active: bool
    deactivated_at: Optional[datetime] = None
    deactivation_reason: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class Participant(ParticipantInDBBase):
    pass
