from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EEGUploadFileInit(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    role: Literal["primary", "data", "markers", "sidecar", "events", "archive"] = "sidecar"
    content_type: str = "application/octet-stream"
    size_bytes: int = Field(gt=0, le=50 * 1024 * 1024 * 1024)
    checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    is_primary: bool = False


class EEGUploadInit(BaseModel):
    participant_id: UUID
    session_id: UUID | None = None
    files: list[EEGUploadFileInit] = Field(min_length=1, max_length=256)

    @model_validator(mode="after")
    def exactly_one_primary(self):
        if sum(item.is_primary for item in self.files) != 1:
            raise ValueError("exactly one bundle file must be primary")
        if len({item.filename.casefold() for item in self.files}) != len(self.files):
            raise ValueError("bundle filenames must be unique")
        return self


class EEGUploadCompleteFile(BaseModel):
    filename: str
    checksum_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")


class EEGUploadComplete(BaseModel):
    files: list[EEGUploadCompleteFile] = Field(min_length=1, max_length=256)


class EEGAnalysisRunCreate(BaseModel):
    profile: Literal["custom", "pyp_eeg_v2"] = "custom"
    pipeline: Literal["individual", "study", "mdmp", "multimodal"] = "individual"
    parameters: dict[str, Any] = Field(default_factory=dict)
    reuse_completed: bool = True


class EEGArtifactDetail(BaseModel):
    id: UUID
    kind: str
    content_type: str
    size_bytes: int
    checksum_sha256: str
    units: str | None = None
    metadata_info: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    download_url: str | None = None
    model_config = ConfigDict(from_attributes=True)


class EEGAnalysisRunDetail(BaseModel):
    id: UUID
    eeg_asset_id: UUID | None = None
    study_id: UUID | None = None
    job_id: UUID | None = None
    scope_type: str
    pipeline: str
    profile: str
    parameters: dict[str, Any]
    input_manifest: list[dict[str, Any]]
    input_hash: str
    package_version: str | None = None
    upstream_commit: str | None = None
    mdmp_version: str | None = None
    mdmp_commit: str | None = None
    status: str
    step_status: dict[str, Any]
    warnings: list[Any]
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    reused: bool = False
    model_config = ConfigDict(from_attributes=True)
