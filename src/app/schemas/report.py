from typing import Dict, Any, Literal
from pydantic import BaseModel, Field, model_validator
from uuid import UUID

class DashboardMetrics(BaseModel):
    total_participants: int
    total_videos_processed: int
    average_learning_gain: float
    microactions_summary: Dict[str, Any]

class ExportResponse(BaseModel):
    download_url: str


ReportTemplateKey = Literal[
    "study_overview",
    "individual_longitudinal",
    "control_group_comparison",
]


class ScientificReportRequest(BaseModel):
    template_key: ReportTemplateKey
    participant_id: UUID | None = None
    control_group_id: UUID | None = None
    comparison_group_ids: list[UUID] = Field(default_factory=list)
    outcome_ids: list[str] = Field(default_factory=list)
    covariate_ids: list[UUID] = Field(default_factory=list)
    confidence_level: float = Field(default=0.95, gt=0.5, lt=1.0)
    alpha: float = Field(default=0.05, gt=0.0, lt=0.5)
    multiplicity: Literal["fdr_bh"] = "fdr_bh"
    seed: int = 20260726

    @model_validator(mode="after")
    def validate_scope(self):
        if self.template_key == "individual_longitudinal" and not self.participant_id:
            raise ValueError("participant_id is required for an individual report")
        if self.template_key == "control_group_comparison":
            if not self.control_group_id or not self.comparison_group_ids:
                raise ValueError(
                    "control_group_id and comparison_group_ids are required"
                )
            if self.control_group_id in self.comparison_group_ids:
                raise ValueError("Control group cannot also be a comparison group")
        return self


class ScientificReportJobResponse(BaseModel):
    job_id: UUID
    status: str = "queued"


class ScientificReportPreview(BaseModel):
    template_key: str
    scope_type: str
    methodology_version: str
    generated_at: str
    study: Dict[str, Any]
    flow: Dict[str, Any]
    summary: Dict[str, Any]
    outcome_catalog: list[Dict[str, Any]]
    outcomes: list[Dict[str, Any]]
    analyses: list[Dict[str, Any]]
    methods: Dict[str, Any]
    quality: Dict[str, Any]
    limitations: list[str]
    data_snapshot_hash: str
    series: list[Dict[str, Any]]
