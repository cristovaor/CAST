from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GazeCalibrationCreate(BaseModel):
    screen_width_px: int = Field(gt=0)
    screen_height_px: int = Field(gt=0)
    pixels_per_degree: float = Field(gt=0)
    random_seed: int = 0
    configuration: dict[str, object] = Field(default_factory=dict)


class GazeSampleCreate(BaseModel):
    client_sample_id: str = Field(min_length=1, max_length=128)
    phase: str = Field(pattern=r"^(fit|validation|drift)$")
    target_x: float = Field(ge=0, le=1)
    target_y: float = Field(ge=0, le=1)
    iris_offset_x: float | None = None
    iris_offset_y: float | None = None
    head_yaw_deg: float | None = None
    head_pitch_deg: float | None = None
    source_time_us: int
    source_clock_id: str = Field(min_length=1, max_length=128)
    canonical_time_us: int | None = None
    uncertainty_us: int = Field(default=0, ge=0)
    quality_flags: list[str] = Field(default_factory=list)
    valid: bool = True


class GazeSampleBatch(BaseModel):
    samples: list[GazeSampleCreate] = Field(min_length=1, max_length=10_000)

    @model_validator(mode="after")
    def one_clock(self):
        if len({sample.source_clock_id for sample in self.samples}) != 1:
            raise ValueError("batch must use one source_clock_id")
        return self


class GazeBatchResult(BaseModel):
    created: int
    reused: int


class GazeCalibrationDetail(BaseModel):
    id: UUID
    session_id: UUID
    status: str
    configuration: dict[str, object]
    metrics: dict[str, object]
    verdict: str | None = None
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class GazeArtifactDetail(BaseModel):
    id: UUID
    calibration_id: UUID
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
