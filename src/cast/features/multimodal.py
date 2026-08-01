"""Synchronized head-video and EEG feature contracts for CAST V8.

This module is intentionally independent from the API/database layer.  It
accepts the versioned EEG time-series rows produced by ``cast_pyp_eeg`` and an
approved affine synchronization mapping, then emits fixed-shape tensors.  EEG
is optional at inference time, but unapproved synchronization is never treated
as valid multimodal evidence.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence

import numpy as np

from cast.features.unified import make_time_centered_windows


MULTIMODAL_SCHEMA_VERSION = "cast-multimodal-v8"
EEG_FEATURE_SCHEMA_VERSION = "eeg-temporal-v1"
EEG_BANDS: tuple[str, ...] = ("delta", "theta", "alpha", "beta", "gamma")
EEG_ROIS: tuple[str, ...] = (
    "global",
    "prefrontal",
    "frontal",
    "frontocentral",
    "central",
    "temporo-parietal",
    "centro-parietal",
    "parietal",
    "occipital",
)


@dataclass(frozen=True)
class EEGFeatureSeries:
    values: np.ndarray
    timestamps_ms: np.ndarray
    feature_names: list[str]
    valid_mask: np.ndarray


@dataclass(frozen=True)
class MultimodalWindows:
    head: np.ndarray
    eeg: np.ndarray
    eeg_present: np.ndarray
    eeg_valid_fraction: np.ndarray
    target_indices: np.ndarray
    eeg_feature_names: list[str]
    modalities_used: tuple[str, ...]
    sync_approved: bool

    def model_inputs(self) -> dict[str, np.ndarray]:
        return {
            "head_sequence": self.head,
            "eeg_sequence": self.eeg,
            "eeg_present": self.eeg_present,
        }


def eeg_feature_names(
    rois: Iterable[str] = EEG_ROIS,
    bands: Iterable[str] = EEG_BANDS,
) -> list[str]:
    return [
        item
        for roi in rois
        for band in bands
        for item in (f"eeg_{roi}_{band}_log_power", f"eeg_{roi}_{band}_coverage")
    ]


def _time_ms(row: Mapping[str, Any]) -> float | None:
    for key, scale in (
        ("timestamp_ms", 1.0),
        ("time_ms", 1.0),
        ("time_seconds", 1000.0),
        ("time", 1000.0),
    ):
        value = row.get(key)
        if value is not None:
            try:
                return float(value) * scale
            except (TypeError, ValueError):
                return None
    return None


def _stable_power(value: float) -> float:
    return float(np.sign(value) * np.log1p(abs(value)))


def extract_eeg_features(
    rows: Sequence[Mapping[str, Any]],
    *,
    rois: tuple[str, ...] = EEG_ROIS,
    bands: tuple[str, ...] = EEG_BANDS,
) -> EEGFeatureSeries:
    """Pivot long-form EEG power rows into a stable time-by-feature matrix."""
    names = eeg_feature_names(rois, bands)
    by_time: dict[float, list[tuple[str | None, str, float, float]]] = {}
    for row in rows:
        timestamp = _time_ms(row)
        band = str(row.get("band") or "").lower()
        if timestamp is None or band not in bands:
            continue
        try:
            value = float(row.get("value"))
        except (TypeError, ValueError):
            continue
        if not np.isfinite(value):
            continue
        raw_scope = row.get("roi")
        scope = str(raw_scope).lower() if raw_scope else None
        if scope not in rois:
            scope = None
        try:
            coverage = float(row.get("channel_coverage", 1.0))
        except (TypeError, ValueError):
            coverage = 0.0
        by_time.setdefault(timestamp, []).append(
            (scope, band, value, float(np.clip(coverage, 0.0, 1.0)))
        )

    if not by_time:
        return EEGFeatureSeries(
            values=np.empty((0, len(names)), dtype=np.float32),
            timestamps_ms=np.empty(0, dtype=np.float64),
            feature_names=names,
            valid_mask=np.empty(0, dtype=bool),
        )

    timestamps = np.asarray(sorted(by_time), dtype=np.float64)
    matrix = np.zeros((len(timestamps), len(names)), dtype=np.float32)
    valid = np.zeros(len(timestamps), dtype=bool)
    for row_index, timestamp in enumerate(timestamps):
        observations = by_time[timestamp]
        column = 0
        for roi in rois:
            for band in bands:
                if roi == "global":
                    selected = [item for item in observations if item[1] == band]
                else:
                    selected = [
                        item
                        for item in observations
                        if item[0] == roi and item[1] == band
                    ]
                if selected:
                    weights = np.asarray(
                        [max(item[3], 1e-6) for item in selected],
                        dtype=np.float64,
                    )
                    values = np.asarray([item[2] for item in selected], dtype=np.float64)
                    matrix[row_index, column] = _stable_power(
                        float(np.average(values, weights=weights))
                    )
                    matrix[row_index, column + 1] = float(np.mean(weights))
                    valid[row_index] = True
                column += 2
    return EEGFeatureSeries(
        values=matrix,
        timestamps_ms=timestamps,
        feature_names=names,
        valid_mask=valid,
    )


def video_to_eeg_ms(video_ms: np.ndarray, mapping: Mapping[str, Any]) -> np.ndarray:
    slope = 1.0 + float(mapping.get("drift_ms_per_min") or 0.0) / 60000.0
    return video_ms.astype(np.float64) * slope - float(mapping.get("offset_ms") or 0.0)


def _nearest_indices(source: np.ndarray, desired: np.ndarray) -> np.ndarray:
    right = np.searchsorted(source, desired, side="left")
    right = np.clip(right, 0, len(source) - 1)
    left = np.clip(right - 1, 0, len(source) - 1)
    choose_right = np.abs(source[right] - desired) < np.abs(source[left] - desired)
    return np.where(choose_right, right, left)


def build_multimodal_windows(
    head_values: np.ndarray,
    head_timestamps_ms: np.ndarray,
    *,
    eeg_series: EEGFeatureSeries | None = None,
    sync_mapping: Mapping[str, Any] | None = None,
    target_fps: float = 30.0,
    head_window_ms: float = 1000.0,
    eeg_window_ms: float = 8000.0,
) -> MultimodalWindows:
    """Align EEG context to every centered head-video window.

    Missing EEG and unapproved mappings emit zero tensors plus a presence mask;
    they never silently use an offset of zero as if it were approved.
    """
    head, targets = make_time_centered_windows(
        head_values,
        head_timestamps_ms,
        target_fps=target_fps,
        window_ms=head_window_ms,
    )
    sequence_length = head.shape[1] if len(head) else 0
    feature_names = (
        eeg_series.feature_names
        if eeg_series is not None
        else eeg_feature_names()
    )
    eeg = np.zeros(
        (len(head), sequence_length, len(feature_names)),
        dtype=np.float32,
    )
    presence = np.zeros((len(head), 1), dtype=np.float32)
    valid_fraction = np.zeros((len(head), 1), dtype=np.float32)
    approved = bool(sync_mapping and sync_mapping.get("approved"))
    has_eeg = bool(
        eeg_series is not None
        and len(eeg_series.timestamps_ms)
        and approved
        and len(head)
    )
    if has_eeg:
        offsets = np.linspace(
            -eeg_window_ms / 2.0,
            eeg_window_ms / 2.0,
            sequence_length,
        )
        for index, timestamp in enumerate(head_timestamps_ms):
            desired_video = timestamp + offsets
            desired_eeg = video_to_eeg_ms(desired_video, sync_mapping or {})
            selected = _nearest_indices(eeg_series.timestamps_ms, desired_eeg)
            eeg[index] = eeg_series.values[selected]
            valid_fraction[index, 0] = float(np.mean(eeg_series.valid_mask[selected]))
        presence[:, 0] = (valid_fraction[:, 0] > 0).astype(np.float32)
    modalities = ("head_video", "eeg") if np.any(presence) else ("head_video",)
    return MultimodalWindows(
        head=head,
        eeg=eeg,
        eeg_present=presence,
        eeg_valid_fraction=valid_fraction,
        target_indices=targets,
        eeg_feature_names=feature_names,
        modalities_used=modalities,
        sync_approved=approved,
    )


def modality_dropout(
    eeg_present: np.ndarray,
    *,
    probability: float,
    seed: int,
) -> np.ndarray:
    """Drop available EEG deterministically without inventing missing samples."""
    if not 0.0 <= probability <= 1.0:
        raise ValueError("probability must be in [0, 1]")
    mask = np.asarray(eeg_present, dtype=np.float32).copy()
    if not len(mask) or probability == 0:
        return mask
    keep = (
        np.random.default_rng(seed).random(mask.shape[0]) >= probability
    ).astype(np.float32)
    mask[:, 0] *= keep
    return mask
