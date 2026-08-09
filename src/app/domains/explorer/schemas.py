from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.time_series import ExplorerTrackDescriptor


class ExplorerManifest(BaseModel):
    session_id: UUID
    start_time_us: int = 0
    end_time_us: int
    tracks: list[ExplorerTrackDescriptor] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ExplorerIntervalExportRequest(BaseModel):
    start_time_us: int = Field(ge=0)
    end_time_us: int = Field(gt=0)
    track_ids: list[str] = Field(default_factory=list, max_length=128)
    format: str = Field(default="json", pattern=r"^(json|parquet-manifest)$")

    @model_validator(mode="after")
    def valid_range(self):
        if self.end_time_us <= self.start_time_us:
            raise ValueError("end_time_us must be greater than start_time_us")
        return self


class ExplorerExportJob(BaseModel):
    job_id: str
