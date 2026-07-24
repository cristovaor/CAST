from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from uuid import UUID

class DashboardKPIs(BaseModel):
    active_projects: int
    ongoing_studies: int
    total_sessions: int
    videos_processed: int
    average_quality: float
    failed_jobs: int

class TimeSeriesPoint(BaseModel):
    date: str
    value: int

class MicroactionDistribution(BaseModel):
    name: str
    OLHO_FECHADO: int
    OLHANDO_CANTO: int
    MEXEU_LABIOS: int
    VIROU_ROSTO: int
    MEXEU_SOBRANCELHA: int

class RecentJob(BaseModel):
    id: UUID
    status: str
    progress: float
    video_filename: Optional[str] = None
    study_name: Optional[str] = None
    elapsed_seconds: int

class RecentStudy(BaseModel):
    id: UUID
    name: str
    status: str
    participant_count: int
    video_count: int
    average_quality: float
    created_at: datetime

class DashboardGlobal(BaseModel):
    kpis: DashboardKPIs
    processing_time_series: List[TimeSeriesPoint]
    microaction_distribution: List[MicroactionDistribution]
    recent_jobs: List[RecentJob]
    recent_studies: List[RecentStudy]

class ActionSummary(BaseModel):
    total_count: int
    average_per_minute: float

class DashboardMetrics(BaseModel):
    total_participants: int
    total_videos_processed: int
    average_learning_gain: float
    microactions_summary: dict[str, ActionSummary]
