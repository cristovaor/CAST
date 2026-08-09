from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PupilObservation(BaseModel):
    source_time_us: int
    source_clock_id: str = Field(min_length=1, max_length=128)
    canonical_time_us: int | None = None
    uncertainty_us: int = Field(default=0, ge=0)
    pupil_diameter_px: float | None = Field(default=None, gt=0)
    iris_diameter_px: float | None = Field(default=None, gt=0)
    luminance: float | None = Field(default=None, ge=0)
    reference_ratio: float | None = Field(default=None, gt=0)
    quality_flags: list[str] = Field(default_factory=list)
    valid: bool = True


class PupilRunCreate(BaseModel):
    face_artifact_id: UUID
    environment_artifact_id: UUID | None = None
    observations: list[PupilObservation] = Field(min_length=3, max_length=100_000)
    configuration: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def monotonic_one_clock(self):
        if len({item.source_clock_id for item in self.observations}) != 1:
            raise ValueError("observations must use one source clock")
        times = [item.source_time_us for item in self.observations]
        if times != sorted(times):
            raise ValueError("observations must be time ordered")
        return self


class PupilRunDetail(BaseModel):
    id: UUID
    session_id: UUID
    face_artifact_id: UUID
    environment_artifact_id: UUID | None = None
    status: str
    metrics: dict[str, object]
    verdict: str | None = None
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class PupilArtifactDetail(BaseModel):
    id: UUID
    run_id: UUID
    kind: str
    layer: str
    storage_uri: str
    checksum_sha256: str
    start_time_us: int
    end_time_us: int
    sample_count: int
    metrics: dict[str, object]
    provenance: dict[str, object]
    model_config = ConfigDict(from_attributes=True)
