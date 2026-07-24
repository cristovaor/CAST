"""Inference adapters for batch prediction."""
from __future__ import annotations

import pandas as pd
from typing import Dict, Any, List, Optional
from app.ml.inference_engine import run_full_inference, InferenceRunResult
from cast.models.manifest import ModelManifest

def run_batch_predictions(
    df_norm: pd.DataFrame,
    models_by_action: Dict[str, Any],
    manifests_by_action: Dict[str, ModelManifest],
    video_id: str,
    model_version: str,
    fps: float,
    actions: Optional[List[str]] = None
) -> InferenceRunResult:
    """Run full inference batch prediction with thresholding and temporal filtering.
    
    Args:
        df_norm: Normalized landmarks DataFrame.
        models_by_action: Dict of loaded models.
        manifests_by_action: Dict of model manifests.
        video_id: Video identifier.
        model_version: Active model version.
        fps: Video frame rate.
        actions: Actions to run.
        
    Returns:
        InferenceRunResult aggregating all action results.
    """
    return run_full_inference(
        df_norm=df_norm,
        models_by_action=models_by_action,
        manifests_by_action=manifests_by_action,
        video_id=video_id,
        model_id="cast-mvp",
        model_version=model_version,
        fps=fps,
        actions=actions,
        feature_mode="roi_features"
    )
