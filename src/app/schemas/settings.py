from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Literal, Optional
from uuid import UUID
from zoneinfo import available_timezones

SupportedLocale = Literal["pt-BR", "en"]


class OrganizationSettings(BaseModel):
    id: UUID
    name: str
    display_name: Optional[str] = None
    institution: Optional[str] = None
    contact_email: Optional[str] = None
    timezone: str = "America/Sao_Paulo"
    default_locale: str = "pt-BR"
    plan: str
    max_storage_gb: float
    used_storage_gb: float


class OrganizationSettingsUpdate(BaseModel):
    """Editable by admins. Plan and storage quota are contractual and stay
    read-only here."""

    name: Optional[str] = Field(None, min_length=2, max_length=120)
    display_name: Optional[str] = Field(None, max_length=40)
    institution: Optional[str] = Field(None, max_length=200)
    contact_email: Optional[EmailStr] = None
    timezone: Optional[str] = None
    default_locale: Optional[SupportedLocale] = None

    @field_validator("name", mode="before")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("display_name", "institution", "contact_email", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value):
        if value is not None and value not in available_timezones():
            raise ValueError("Unknown IANA timezone")
        return value


class PipelineSettingsUpdate(BaseModel):
    face_detection_threshold: Optional[float] = Field(None, ge=0, le=1)
    blink_tolerance_frames: Optional[int] = Field(None, ge=1, le=120)
    enable_head_pose_estimation: Optional[bool] = None

class PipelineSettings(PipelineSettingsUpdate):
    pass
