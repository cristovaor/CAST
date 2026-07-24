"""Model manifest — serialization, loading, and feature validation."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

class TrainingConfig(BaseModel):
    """Snapshot of hyperparameters used in training."""
    epochs: int
    batch_size: int
    learning_rate: float
    optimizer: str = "adam"
    early_stopping_patience: int = 5
    label_policy: str = "last_frame_in_window"
    seed: int = 42

class FrameLevelMetrics(BaseModel):
    """Frame-level classification metrics."""
    accuracy: float = 0.0
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    specificity: float = 0.0
    tn: int = 0
    fp: int = 0
    fn: int = 0
    tp: int = 0

class FoldMetrics(BaseModel):
    """Per-fold metrics from leave-one-video-out evaluation."""
    fold_id: str
    video_id: str
    metrics: FrameLevelMetrics
    class_weights: Dict[str, float] = Field(default_factory=dict)

class ModelManifest(BaseModel):
    """Complete model manifest, saved alongside .keras artifact."""

    # Identity
    manifest_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    model_id: str
    version: str
    action: str
    framework: str = "tensorflow/keras"
    architecture: str = "cast-lstm-v6"

    # Feature contract
    feature_names: List[str] = Field(default_factory=list)
    feature_count: int = 0
    sequence_length: int = 7
    threshold: float = 0.5

    # Hyperparameters
    training_config: TrainingConfig

    # Metrics
    fold_metrics: List[FoldMetrics] = Field(default_factory=list)
    avg_metrics: Optional[FrameLevelMetrics] = None

    # Lifecycle
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    artifact_uri: Optional[str] = None
    status: str = "draft"  # draft | candidate | active | archived

    def save(self, path: Path | str) -> None:
        """Serialize manifest to JSON file."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.model_dump_json(indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path | str) -> "ModelManifest":
        """Deserialize manifest from JSON file."""
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Manifest not found: {path}")
        return cls.model_validate_json(path.read_text(encoding="utf-8"))

    def validate_features(self, incoming_features: List[str]) -> None:
        """Raise ValueError if incoming feature list doesn't match manifest."""
        if incoming_features == self.feature_names:
            return

        if set(incoming_features) != set(self.feature_names):
            missing = set(self.feature_names) - set(incoming_features)
            extra = set(incoming_features) - set(self.feature_names)
            raise ValueError(
                f"FEATURE_SCHEMA_MISMATCH for action {self.action}: "
                f"missing={sorted(missing)}, extra={sorted(extra)}"
            )

        mismatches = [
            (i, exp, got)
            for i, (exp, got) in enumerate(zip(self.feature_names, incoming_features))
            if exp != got
        ]
        raise ValueError(
            f"FEATURE_ORDER_MISMATCH for action {self.action}: "
            f"{len(mismatches)} position(s) differ. First: index {mismatches[0][0]}, "
            f"expected '{mismatches[0][1]}', got '{mismatches[0][2]}'"
        )

    def compute_avg_metrics(self) -> None:
        """Compute and store average metrics across all folds."""
        if not self.fold_metrics:
            return
        keys = ["accuracy", "precision", "recall", "f1", "specificity"]
        avgs: Dict[str, Any] = {}
        for k in keys:
            avgs[k] = sum(getattr(fm.metrics, k) for fm in self.fold_metrics) / len(self.fold_metrics)
        for k in ["tn", "fp", "fn", "tp"]:
            avgs[k] = sum(getattr(fm.metrics, k) for fm in self.fold_metrics)
        self.avg_metrics = FrameLevelMetrics(**avgs)
