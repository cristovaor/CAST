"""Inference adapter for the single-artifact CAST Unified V7 model."""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from cast.config.taxonomy import (
    CONTINUOUS_SIGNALS,
    CORE_ACTIONS,
    EXPERIMENTAL_ACTIONS,
)
from cast.features.unified import (
    extract_unified_features,
    make_time_centered_windows,
)
from cast.features.multimodal import (
    build_multimodal_windows,
    extract_eeg_features,
)
from cast.models.manifest import ModelManifest
from cast.models.unified_classifier import unified_output_heads
from cast.postprocessing.unified import UnifiedEvent, compact_unified_predictions


@dataclass(frozen=True)
class UnifiedInferenceResult:
    request_id: str
    video_id: str
    model_version: str
    calibration_version: str
    fps: float
    events: list[UnifiedEvent]
    frame_indices: np.ndarray
    timestamps_ms: np.ndarray
    probabilities: dict[str, np.ndarray]
    signals: list[dict[str, float | int | bool]]
    latency_ms: float
    modalities_used: tuple[str, ...] = ("head_video",)
    sync_quality: dict[str, Any] | None = None
    branch_contributions: dict[str, float] | None = None
    eeg_validation_status: str = "not_available"
    schema_version: str = "cast-unified-v7"

    def legacy_summary(self) -> dict[str, dict[str, float | int]]:
        duration_minutes = (
            (float(self.timestamps_ms[-1]) / 1000.0) / 60.0
            if len(self.timestamps_ms)
            else 0.0
        )
        summary: dict[str, dict[str, float | int]] = {}
        for label in (*CORE_ACTIONS, *EXPERIMENTAL_ACTIONS):
            label_events = [event for event in self.events if event.action_code == label]
            summary[label] = {
                "count": len(label_events),
                "total_events": len(label_events),
                "events_per_minute": round(
                    len(label_events) / max(duration_minutes, 1e-8), 4
                ),
                "mean_confidence": round(
                    float(np.mean([event.confidence for event in label_events])),
                    4,
                )
                if label_events
                else 0.0,
                "mean_event_duration_ms": round(
                    float(np.mean([event.duration_ms for event in label_events])),
                    3,
                )
                if label_events
                else 0.0,
            }
        return summary

    def payload(self, landmark_artifact_id: str) -> dict[str, Any]:
        events = [event.to_api() for event in self.events]
        actions = []
        for label in (*CORE_ACTIONS, *EXPERIMENTAL_ACTIONS):
            label_events = [
                {
                    "start_frame": event.start_frame,
                    "end_frame": event.end_frame,
                    "start_ms": event.start_ms,
                    "end_ms": event.end_ms,
                    "duration_ms": event.duration_ms,
                    "avg_confidence": event.confidence,
                    "side": event.side,
                    "direction": event.direction,
                    "subtype": event.subtype,
                    "magnitude": event.magnitude,
                    "quality": event.quality,
                    "signals": event.signals,
                }
                for event in self.events
                if event.action_code == label
            ]
            actions.append({"action": label, "error": None, "events": label_events})
        return {
            "schema_version": self.schema_version,
            "request_id": self.request_id,
            "video_id": self.video_id,
            "landmark_artifact_id": landmark_artifact_id,
            "model_version": self.model_version,
            "calibration_version": self.calibration_version,
            "fps": self.fps,
            "events": events,
            # Compatibility shape consumed by the existing annotation endpoint.
            "actions": actions,
            "frameSignals": self.signals,
            "modalitiesUsed": list(self.modalities_used),
            "syncQuality": self.sync_quality or {},
            "branchContributions": self.branch_contributions or {},
            "eegValidationStatus": self.eeg_validation_status,
        }


def _prediction_dict(
    model: Any,
    windows: np.ndarray | dict[str, np.ndarray],
) -> dict[str, np.ndarray]:
    prediction = model.predict(windows, verbose=0)
    if isinstance(prediction, dict):
        return {key: np.asarray(value) for key, value in prediction.items()}
    if isinstance(prediction, (list, tuple)):
        names = list(getattr(model, "output_names", []))
        if len(names) != len(prediction):
            raise ValueError("Unified model returned unnamed output tensors")
        return {
            name: np.asarray(value)
            for name, value in zip(names, prediction)
        }
    raise ValueError("Unified model must return a dict or list of output heads")


def run_unified_inference(
    raw_landmarks: pd.DataFrame,
    model: Any,
    manifest: ModelManifest,
    *,
    video_id: str,
    fps: float,
    eeg_rows: list[dict[str, Any]] | None = None,
    sync_mapping: dict[str, Any] | None = None,
    eeg_metadata: dict[str, Any] | None = None,
    enable_head_pose_estimation: bool = True,
) -> UnifiedInferenceResult:
    started = time.perf_counter()
    features = extract_unified_features(
        raw_landmarks,
        enable_head_pose_estimation=enable_head_pose_estimation,
    )
    manifest.validate_features(features.feature_names)
    modalities_used: tuple[str, ...] = ("head_video",)
    sync_quality = dict(sync_mapping or {})
    branch_contributions = {"head_video": 1.0, "eeg": 0.0}
    eeg_validation_status = "not_available"
    if manifest.architecture == "cast-multimodal-v8":
        minimum_valid_ratio = float(
            manifest.sync_requirements.get("min_eeg_valid_ratio", 0.70)
        )
        eeg_status = (eeg_metadata or {}).get("status")
        eeg_valid_ratio = (eeg_metadata or {}).get("valid_ratio")
        quality_approved = True
        quality_status = eeg_status or "not_available"
        if eeg_metadata is not None:
            if eeg_status != "ready":
                quality_approved = False
            elif eeg_valid_ratio is None:
                quality_approved = False
                quality_status = "quality_unassessed"
            elif float(eeg_valid_ratio) < minimum_valid_ratio:
                quality_approved = False
                quality_status = "quality_below_threshold"
        eeg_series = extract_eeg_features(
            (eeg_rows or []) if quality_approved else []
        )
        effective_mapping = (
            sync_mapping if quality_approved else {"approved": False}
        )
        multimodal = build_multimodal_windows(
            features.values,
            features.timestamps_ms,
            eeg_series=eeg_series,
            sync_mapping=effective_mapping,
            target_fps=manifest.target_fps,
            head_window_ms=manifest.window_ms,
            eeg_window_ms=float(
                manifest.sync_requirements.get("eeg_window_ms", 8000.0)
            ),
        )
        expected_eeg = manifest.modality_feature_names.get("eeg", [])
        if expected_eeg and expected_eeg != multimodal.eeg_feature_names:
            raise ValueError("EEG_FEATURE_SCHEMA_MISMATCH")
        model_inputs = multimodal.model_inputs()
        outputs = _prediction_dict(model, model_inputs)
        modalities_used = multimodal.modalities_used
        eeg_validation_status = (
            "available"
            if "eeg" in modalities_used
            else quality_status
        )
        if "eeg" in modalities_used:
            try:
                import tensorflow as tf

                gate_model = tf.keras.Model(
                    model.inputs,
                    model.get_layer("eeg_fusion_gate").output,
                )
                gate = gate_model.predict(model_inputs, verbose=0)
                eeg_contribution = float(np.mean(gate))
            except Exception:
                eeg_contribution = float(np.mean(multimodal.eeg_present))
            branch_contributions["eeg"] = round(eeg_contribution, 4)
            branch_contributions["head_video"] = round(
                1.0 - eeg_contribution,
                4,
            )
        windows = multimodal.head
    else:
        windows, _ = make_time_centered_windows(
            features.values,
            features.timestamps_ms,
            target_fps=manifest.target_fps,
            window_ms=manifest.window_ms,
        )
        outputs = _prediction_dict(model, windows)
    heads = manifest.output_heads or unified_output_heads()

    probabilities: dict[str, np.ndarray] = {}
    for head_name in ("actions", "observable_movements"):
        labels = heads.get(head_name, [])
        values = outputs.get(head_name)
        if values is None:
            continue
        if values.shape[1] != len(labels):
            raise ValueError(f"Output size mismatch for {head_name}")
        probabilities.update(
            {label: values[:, index] for index, label in enumerate(labels)}
        )

    direction_probabilities = {
        name: outputs[name]
        for name in (
            "gaze_horizontal",
            "gaze_vertical",
            "head_horizontal",
            "head_vertical",
            "head_tilt",
        )
        if name in outputs
    }
    side_probabilities = {
        name: outputs[name]
        for name in ("eye_side", "brow_side")
        if name in outputs
    }
    signal_arrays: dict[str, np.ndarray] = {}
    model_signals = outputs.get("signals")
    if model_signals is not None:
        for index, name in enumerate(heads.get("signals", CONTINUOUS_SIGNALS)):
            signal_arrays[name] = model_signals[:, index]
    face_detected = np.asarray(
        [bool(row["face_detected"]) for row in features.signals],
        dtype=bool,
    )
    events = compact_unified_predictions(
        probabilities,
        features.frame_indices,
        features.timestamps_ms,
        fps=fps,
        calibration=manifest.postprocessing or manifest.calibration,
        face_detected=face_detected,
        direction_probabilities=direction_probabilities,
        side_probabilities=side_probabilities,
        signal_values=signal_arrays,
    )
    return UnifiedInferenceResult(
        request_id=str(uuid.uuid4()),
        video_id=video_id,
        model_version=manifest.version,
        calibration_version=manifest.calibration_version,
        fps=fps,
        events=events,
        frame_indices=features.frame_indices,
        timestamps_ms=features.timestamps_ms,
        probabilities=probabilities,
        signals=features.signals,
        latency_ms=round((time.perf_counter() - started) * 1000.0, 2),
        modalities_used=modalities_used,
        sync_quality=sync_quality,
        branch_contributions=branch_contributions,
        eeg_validation_status=eeg_validation_status,
        schema_version=(
            "cast-multimodal-v8"
            if manifest.architecture == "cast-multimodal-v8"
            else "cast-unified-v7"
        ),
    )
