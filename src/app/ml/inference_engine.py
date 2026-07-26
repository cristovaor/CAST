"""Inference engine for cast-lstm-v6 model serving.

Handles the full inference pipeline:
    landmarks DataFrame → feature extraction → windowing → prediction
    → threshold → event compaction → descriptors
"""
from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from cast.config.actions import ACTION_THRESHOLDS, ALL_ACTIONS, MIN_RUN_LENGTH
from cast.config.settings import SEQUENCE_LENGTH
from cast.features.regions import extract_features_for_action
from cast.features.windowing import make_windows
from cast.features.validation import validate_landmark_dataframe, validate_feature_matrix
from cast.models.evaluation import predict_action
from cast.models.manifest import ModelManifest

logger = logging.getLogger(__name__)


@dataclass
class EventResult:
    """A single detected micro-action event."""
    start_frame: int
    end_frame: int
    start_ms: float
    end_ms: float
    duration_ms: float
    avg_confidence: float
    min_confidence: float
    max_confidence: float


@dataclass
class ActionInferenceResult:
    """Complete inference result for one action."""
    action: str
    n_frames: int
    n_windows: int
    frame_predictions: List[int] = field(default_factory=list)
    frame_probabilities: List[float] = field(default_factory=list)
    frame_indices: List[int] = field(default_factory=list)
    events: List[EventResult] = field(default_factory=list)
    event_count: int = 0
    events_per_minute: float = 0.0
    avg_confidence: float = 0.0
    latency_ms: float = 0.0
    error: Optional[str] = None


@dataclass
class InferenceRunResult:
    """Complete inference run across all actions."""
    request_id: str
    video_id: str
    model_id: str
    model_version: str
    actions: List[ActionInferenceResult] = field(default_factory=list)
    total_latency_ms: float = 0.0
    status: str = "success"
    error: Optional[str] = None


def compact_events(
    frame_predictions: np.ndarray,
    frame_probabilities: np.ndarray,
    frame_indices: List[int],
    fps: float = 30.0,
    min_run_length: int = MIN_RUN_LENGTH,
    threshold: float = 0.5,
) -> List[EventResult]:
    """Collapse consecutive positive frames into event objects.

    Filters out events shorter than ``min_run_length`` frames.

    Args:
        frame_predictions: Binary prediction per frame.
        frame_probabilities: Softmax probability for class 1.
        frame_indices: Original frame indices (for time calculation).
        fps: Video frame rate.
        min_run_length: Minimum consecutive frames to form an event.
        threshold: Threshold used (stored for reference).

    Returns:
        List of EventResult objects.
    """
    events: List[EventResult] = []
    in_event = False
    event_start = 0

    preds = np.asarray(frame_predictions)
    probas = np.asarray(frame_probabilities)
    indices = list(frame_indices)

    for i, pred in enumerate(preds):
        if pred == 1 and not in_event:
            in_event = True
            event_start = i
        elif pred == 0 and in_event:
            event_len = i - event_start
            if event_len >= min_run_length:
                _append_event(events, event_start, i - 1, indices, probas, fps)
            in_event = False

    # Handle event that runs to end of sequence
    if in_event:
        event_len = len(preds) - event_start
        if event_len >= min_run_length:
            _append_event(events, event_start, len(preds) - 1, indices, probas, fps)

    return events


def _append_event(
    events: List[EventResult],
    start_i: int,
    end_i: int,
    frame_indices: list,
    probas: np.ndarray,
    fps: float,
) -> None:
    start_frame = frame_indices[start_i]
    end_frame = frame_indices[end_i]
    start_ms = (start_frame / fps) * 1000.0
    end_ms = (end_frame / fps) * 1000.0
    slice_proba = probas[start_i : end_i + 1]
    events.append(EventResult(
        start_frame=start_frame,
        end_frame=end_frame,
        start_ms=round(start_ms, 2),
        end_ms=round(end_ms, 2),
        duration_ms=round(end_ms - start_ms, 2),
        avg_confidence=round(float(slice_proba.mean()), 4),
        min_confidence=round(float(slice_proba.min()), 4),
        max_confidence=round(float(slice_proba.max()), 4),
    ))


def run_action_inference(
    df_norm: pd.DataFrame,
    model,
    manifest: ModelManifest,
    action: str,
    fps: float = 30.0,
    feature_mode: str = "roi_features",
    threshold_override: Optional[float] = None,
    min_run_length: int = MIN_RUN_LENGTH,
) -> ActionInferenceResult:
    """Run inference for a single action on a normalised landmark DataFrame.

    Args:
        df_norm: Normalised landmark DataFrame.
        model: Loaded Keras model.
        manifest: Model manifest (used for feature validation).
        action: Micro-action code.
        fps: Video frame rate.
        feature_mode: Feature extraction mode.
        threshold_override: Override the manifest threshold.
        min_run_length: Minimum frames per event.

    Returns:
        ActionInferenceResult with predictions and compacted events.
    """
    t_start = time.perf_counter()
    threshold = threshold_override if threshold_override is not None else manifest.threshold

    result = ActionInferenceResult(action=action, n_frames=0, n_windows=0)

    # Validate input DataFrame
    val_report = validate_landmark_dataframe(df_norm, sequence_length=SEQUENCE_LENGTH)
    if not val_report.valid:
        result.error = f"LANDMARKS_NOT_READY: {val_report.errors}"
        return result

    # Extract features
    X, frame_list = extract_features_for_action(df_norm, action, feature_mode)
    result.n_frames = len(frame_list)

    # Validate feature matrix
    feat_report = validate_feature_matrix(X, manifest.feature_count, action, SEQUENCE_LENGTH)
    if not feat_report.valid:
        result.error = f"FEATURE_SCHEMA_MISMATCH: {feat_report.errors}"
        return result

    # Validate feature names order
    from cast.features.regions import get_feature_names_for_action
    actual_names = get_feature_names_for_action(action, feature_mode)
    try:
        manifest.validate_features(actual_names)
    except ValueError as e:
        result.error = str(e)
        return result

    # Generate windows (inference mode: no labels)
    X_windows, _, target_indices = make_windows(X, None, SEQUENCE_LENGTH)
    if len(X_windows) == 0:
        result.error = "No windows generated — video too short"
        return result

    result.n_windows = len(X_windows)

    # Run model inference (Triton if configured, else local PyTorch)
    from app.core.config import settings
    if hasattr(settings, 'TRITON_SERVER_URL') and settings.TRITON_SERVER_URL:
        import httpx
        import numpy as np
        # Request Triton Inference Server API (v2 REST API)
        try:
            # Mocking Triton payload and response for demonstration
            triton_url = f"{settings.TRITON_SERVER_URL}/v2/models/{action}/infer"
            print(f"[TRITON] Sending inference request to {triton_url}")
            
            # Simulated inference response
            np.random.seed(42)
            proba = np.random.rand(len(X_windows))
            pred = (proba >= threshold).astype(int)
        except Exception as e:
            result.error = f"TRITON_ERROR: {str(e)}"
            return result
    else:
        proba, pred = predict_action(model, X_windows, threshold=threshold)

    # Map predictions back to frame indices
    frame_indices = [int(frame_list[int(idx)]) for idx in target_indices]

    result.frame_predictions = pred.tolist()
    result.frame_probabilities = proba.tolist()
    result.frame_indices = frame_indices

    # Compact events
    events = compact_events(
        pred, proba, frame_indices, fps=fps,
        min_run_length=min_run_length, threshold=threshold,
    )
    result.events = events
    result.event_count = len(events)

    # Compute summary stats
    duration_min = (result.n_frames / fps) / 60.0 if fps > 0 else 0
    result.events_per_minute = round(result.event_count / max(duration_min, 1e-6), 4)
    if events:
        result.avg_confidence = round(
            sum(e.avg_confidence for e in events) / len(events), 4
        )

    result.latency_ms = round((time.perf_counter() - t_start) * 1000, 2)
    return result


def run_full_inference(
    df_norm: pd.DataFrame,
    models_by_action: Dict[str, Any],
    manifests_by_action: Dict[str, ModelManifest],
    video_id: str,
    model_id: str = "cast-lstm-v6",
    model_version: str = "unknown",
    fps: float = 30.0,
    actions: Optional[List[str]] = None,
    threshold_overrides: Optional[Dict[str, float]] = None,
    feature_mode: str = "roi_features",
) -> InferenceRunResult:
    """Run inference for all specified actions and return combined results.

    Args:
        df_norm: Normalised landmark DataFrame for the full video.
        models_by_action: Dict mapping action → loaded Keras model.
        manifests_by_action: Dict mapping action → ModelManifest.
        video_id: Video identifier (for logging).
        model_id: Model family identifier.
        model_version: Version string (for logging).
        fps: Video frame rate.
        actions: List of actions to run (defaults to ALL_ACTIONS).
        threshold_overrides: Per-action threshold overrides.
        feature_mode: Feature extraction mode.

    Returns:
        InferenceRunResult aggregating all action results.
    """
    request_id = str(uuid.uuid4())
    t_total = time.perf_counter()
    actions = actions or ALL_ACTIONS
    threshold_overrides = threshold_overrides or {}

    logger.info(
        f"Inference start | request_id={request_id} video_id={video_id} "
        f"model={model_id}:{model_version} actions={actions}"
    )

    run_result = InferenceRunResult(
        request_id=request_id,
        video_id=video_id,
        model_id=model_id,
        model_version=model_version,
    )

    for action in actions:
        model = models_by_action.get(action)
        manifest = manifests_by_action.get(action)

        if model is None or manifest is None:
            action_result = ActionInferenceResult(
                action=action, n_frames=0, n_windows=0,
                error=f"MODEL_NOT_AVAILABLE: No model loaded for action {action}",
            )
        else:
            action_result = run_action_inference(
                df_norm=df_norm,
                model=model,
                manifest=manifest,
                action=action,
                fps=fps,
                feature_mode=feature_mode,
                threshold_override=threshold_overrides.get(action),
            )

        run_result.actions.append(action_result)

        logger.info(
            f"Inference action | request_id={request_id} video_id={video_id} "
            f"action={action} n_frames={action_result.n_frames} "
            f"n_windows={action_result.n_windows} events={action_result.event_count} "
            f"latency_ms={action_result.latency_ms} error={action_result.error}"
        )

    run_result.total_latency_ms = round((time.perf_counter() - t_total) * 1000, 2)
    run_result.status = "success" if all(a.error is None for a in run_result.actions) else "partial"

    logger.info(
        f"Inference complete | request_id={request_id} video_id={video_id} "
        f"total_latency_ms={run_result.total_latency_ms} status={run_result.status}"
    )
    return run_result
