"""Pydantic schemas for inference API endpoints."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class InferenceRequest(BaseModel):
    """Request body for starting a batch inference job."""
    model_id: str = Field(default="cast-lstm-v6", description="Model family identifier")
    model_version: Optional[str] = Field(None, description="Specific version (None = active)")
    actions: Optional[List[str]] = Field(None, description="Actions to infer (None = all)")
    threshold_overrides: Optional[Dict[str, float]] = Field(
        None, description="Per-action threshold overrides"
    )
    feature_mode: str = Field(default="roi_features", description="Feature extraction mode")


class InferenceJobStatus(BaseModel):
    """Status of an async inference job."""
    job_id: str
    video_id: str
    status: str  # queued | running | succeeded | failed | canceled
    progress: float = 0.0
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    error: Optional[str] = None


class EventDetail(BaseModel):
    """A single detected micro-action event."""
    start_frame: int
    end_frame: int
    start_ms: float
    end_ms: float
    duration_ms: float
    avg_confidence: float


class ActionPredictions(BaseModel):
    """Prediction results for a single micro-action."""
    action: str
    n_frames: int
    n_windows: int
    event_count: int
    events_per_minute: float
    avg_confidence: float
    latency_ms: float
    error: Optional[str] = None
    events: List[EventDetail] = Field(default_factory=list)
    frame_predictions: List[int] = Field(default_factory=list)
    frame_probabilities: List[float] = Field(default_factory=list)
    frame_indices: List[int] = Field(default_factory=list)


class PredictionResult(BaseModel):
    """Complete prediction result for a video."""
    request_id: str
    video_id: str
    model_id: str
    model_version: str
    fps: float
    total_latency_ms: float
    status: str
    actions: List[ActionPredictions] = Field(default_factory=list)


class VideoDescriptors(BaseModel):
    """High-level event descriptors per action for a video."""
    video_id: str
    actions: Dict[str, Any] = Field(default_factory=dict)


class CompactionRequest(BaseModel):
    """Request to re-compact predictions with new parameters."""
    min_run_length: int = Field(default=3, ge=1)
    threshold_overrides: Optional[Dict[str, float]] = None
