from typing import Dict, Any
from pydantic import BaseModel

class DashboardMetrics(BaseModel):
    total_participants: int
    total_videos_processed: int
    average_learning_gain: float
    microactions_summary: Dict[str, Any]

class ExportResponse(BaseModel):
    download_url: str
