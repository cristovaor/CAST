"""Shared feature extraction for the CAST unified V7 model."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np
import pandas as pd

from cast.config.landmarks import FACEMESH_REGIONS
from cast.config.taxonomy import CONTINUOUS_SIGNALS


UNIFIED_LANDMARK_IDS: tuple[int, ...] = tuple(
    sorted({point for points in FACEMESH_REGIONS.values() for point in points})
)

RIGHT_EYE_EAR = (33, 160, 158, 133, 153, 144)
LEFT_EYE_EAR = (362, 385, 387, 263, 373, 380)
RIGHT_IRIS = (469, 470, 471, 472)
LEFT_IRIS = (474, 475, 476, 477)
HEAD_MOTION_SCHEMA_VERSION = "head-motion-v1"

_VELOCITY_SOURCES = {
    "velocity_yaw": "yaw",
    "velocity_pitch": "pitch",
    "velocity_roll": "roll",
    "velocity_gaze_horizontal": "gaze_horizontal",
    "velocity_gaze_vertical": "gaze_vertical",
}

_ACCELERATION_SOURCES = {
    "acceleration_eyes": "motion_eyes",
    "acceleration_irises": "motion_irises",
    "acceleration_mouth": "motion_mouth",
    "acceleration_brows": "motion_brows",
    "acceleration_head": "motion_head",
}


@dataclass(frozen=True)
class UnifiedFeatureSeries:
    values: np.ndarray
    frame_indices: np.ndarray
    timestamps_ms: np.ndarray
    feature_names: list[str]
    signals: list[dict[str, float | int | bool]]


def unified_feature_names(
    landmark_ids: Iterable[int] = UNIFIED_LANDMARK_IDS,
) -> list[str]:
    names: list[str] = []
    for point_id in landmark_ids:
        names.extend(
            (
                f"lm_{point_id}_x",
                f"lm_{point_id}_y",
                f"lm_{point_id}_z",
                f"lm_{point_id}_present",
            )
        )
    names.extend(CONTINUOUS_SIGNALS)
    return names


def _distance(a: np.ndarray | None, b: np.ndarray | None) -> float:
    if a is None or b is None:
        return 0.0
    return float(np.linalg.norm(a[:2] - b[:2]))


def _finite_float(value: object, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if np.isfinite(parsed) else default


def _mean(points: dict[int, np.ndarray], ids: Iterable[int]) -> np.ndarray | None:
    values = [points[index] for index in ids if index in points]
    return np.mean(values, axis=0) if values else None


def _ear(points: dict[int, np.ndarray], ids: tuple[int, ...]) -> float:
    try:
        p1, p2, p3, p4, p5, p6 = (points[index] for index in ids)
    except KeyError:
        return 0.0
    width = max(_distance(p1, p4), 1e-8)
    return (_distance(p2, p6) + _distance(p3, p5)) / (2.0 * width)


def _iris_offset(
    points: dict[int, np.ndarray],
    iris_ids: tuple[int, ...],
    eye_corner_a: int,
    eye_corner_b: int,
    eye_top: int,
    eye_bottom: int,
) -> tuple[float, float]:
    iris = _mean(points, iris_ids)
    if (
        iris is None
        or eye_corner_a not in points
        or eye_corner_b not in points
        or eye_top not in points
        or eye_bottom not in points
    ):
        return 0.0, 0.0
    a, b = points[eye_corner_a], points[eye_corner_b]
    top, bottom = points[eye_top], points[eye_bottom]
    center = (a + b + top + bottom) / 4.0
    return (
        float((iris[0] - center[0]) / max(abs(b[0] - a[0]), 1e-8)),
        float((iris[1] - center[1]) / max(abs(bottom[1] - top[1]), 1e-8)),
    )


def _region_motion(
    current: dict[int, np.ndarray],
    previous: dict[int, np.ndarray] | None,
    region_names: Iterable[str],
) -> float:
    if not previous:
        return 0.0
    ids = {
        point
        for region in region_names
        for point in FACEMESH_REGIONS.get(region, ())
    }
    shared = ids & current.keys() & previous.keys()
    if not shared:
        return 0.0
    return float(
        np.mean(
            [
                np.linalg.norm(current[index][:2] - previous[index][:2])
                for index in shared
            ]
        )
    )


def _canonicalize(points: dict[int, np.ndarray]) -> dict[int, np.ndarray]:
    """Scale and rotate landmarks into an eye-aligned face coordinate frame."""
    if 33 not in points or 263 not in points:
        return points
    right_eye, left_eye = points[33], points[263]
    center = (right_eye + left_eye) / 2.0
    delta = left_eye[:2] - right_eye[:2]
    scale = max(float(np.linalg.norm(delta)), 1e-8)
    angle = float(np.arctan2(delta[1], delta[0]))
    cosine, sine = np.cos(-angle), np.sin(-angle)
    rotation = np.array([[cosine, -sine], [sine, cosine]], dtype=np.float32)
    canonical: dict[int, np.ndarray] = {}
    for index, value in points.items():
        xy = rotation @ ((value[:2] - center[:2]) / scale)
        z = (value[2] - center[2]) / scale
        canonical[index] = np.array([xy[0], xy[1], z], dtype=np.float32)
    return canonical


def _signals(
    raw: dict[int, np.ndarray],
    canonical: dict[int, np.ndarray],
    previous: dict[int, np.ndarray] | None,
    face_detected: bool,
) -> dict[str, float]:
    right_ear = _ear(canonical, RIGHT_EYE_EAR)
    left_ear = _ear(canonical, LEFT_EYE_EAR)
    gaze_right = _iris_offset(canonical, RIGHT_IRIS, 33, 133, 159, 145)
    gaze_left = _iris_offset(canonical, LEFT_IRIS, 362, 263, 386, 374)
    gaze_h = float(np.mean((gaze_left[0], gaze_right[0])))
    gaze_v = float(np.mean((gaze_left[1], gaze_right[1])))

    mouth_width = _distance(canonical.get(61), canonical.get(291))
    mouth_open = (
        _distance(canonical.get(13), canonical.get(14))
        / max(mouth_width, 1e-8)
    )
    lip_compression = 1.0 / max(mouth_open + 0.02, 0.02)
    corners = _mean(canonical, (61, 291))
    lip_center = _mean(canonical, (0, 17))
    smile_curvature = (
        float(lip_center[1] - corners[1])
        if corners is not None and lip_center is not None
        else 0.0
    )
    brow_left = _mean(canonical, FACEMESH_REGIONS["sobrancelha_esquerda"])
    brow_right = _mean(canonical, FACEMESH_REGIONS["sobrancelha_direita"])
    eye_left = _mean(canonical, FACEMESH_REGIONS["olho_esquerdo"])
    eye_right = _mean(canonical, FACEMESH_REGIONS["olho_direito"])
    brow_height_left = (
        float(eye_left[1] - brow_left[1])
        if brow_left is not None and eye_left is not None
        else 0.0
    )
    brow_height_right = (
        float(eye_right[1] - brow_right[1])
        if brow_right is not None and eye_right is not None
        else 0.0
    )
    brow_furrow = 1.0 / max(_distance(canonical.get(107), canonical.get(336)), 1e-4)

    # Geometry proxies are deliberately exposed as signals and auxiliary model
    # targets; they are not claims about emotion or mental state.
    nose = raw.get(1)
    right_eye_raw, left_eye_raw = raw.get(33), raw.get(263)
    yaw = 0.0
    pitch = 0.0
    roll = 0.0
    if nose is not None and right_eye_raw is not None and left_eye_raw is not None:
        eyes_center = (right_eye_raw + left_eye_raw) / 2.0
        eye_distance = max(_distance(right_eye_raw, left_eye_raw), 1e-8)
        yaw = float((nose[0] - eyes_center[0]) / eye_distance)
        pitch = float((nose[1] - eyes_center[1]) / eye_distance)
        delta = left_eye_raw[:2] - right_eye_raw[:2]
        roll = float(np.arctan2(delta[1], delta[0]))

    return {
        "yaw": yaw,
        "pitch": pitch,
        "roll": roll,
        "gaze_horizontal_left": gaze_left[0],
        "gaze_vertical_left": gaze_left[1],
        "gaze_horizontal_right": gaze_right[0],
        "gaze_vertical_right": gaze_right[1],
        "gaze_horizontal": gaze_h,
        "gaze_vertical": gaze_v,
        "eye_open_left": left_ear,
        "eye_open_right": right_ear,
        "mouth_open": mouth_open,
        "smile_curvature": smile_curvature,
        "lip_compression": lip_compression,
        "brow_height_left": brow_height_left,
        "brow_height_right": brow_height_right,
        "brow_furrow": brow_furrow,
        "facial_asymmetry": abs(left_ear - right_ear)
        + abs(brow_height_left - brow_height_right),
        "motion_eyes": _region_motion(
            canonical, previous, ("olho_direito", "olho_esquerdo")
        ),
        "motion_irises": _region_motion(
            canonical, previous, ("iris_direita", "iris_esquerda")
        ),
        "motion_mouth": _region_motion(canonical, previous, ("labios",)),
        "motion_brows": _region_motion(
            canonical,
            previous,
            ("sobrancelha_direita", "sobrancelha_esquerda"),
        ),
        "motion_head": _region_motion(
            canonical, previous, ("nariz", "contorno_rosto")
        ),
        "face_detected": float(face_detected),
    }


def _raw_frame_metrics(rows: pd.DataFrame) -> dict[str, float]:
    """Read frame-level metrics emitted by the video extractor.

    Metrics are repeated on landmark rows in the raw parquet so older artifacts
    remain readable and newer artifacts do not require a second sidecar.
    """
    first = rows.iloc[0]
    return {
        name: float(first.get(name, 0.0) or 0.0)
        for name in (
            "flow_eyes",
            "flow_mouth",
            "flow_brows",
            "flow_face",
            "blur_score",
            "illumination_mean",
        )
    }


def _temporal_derivatives(
    current: dict[str, float],
    previous: dict[str, float] | None,
    timestamp_ms: float,
    previous_timestamp_ms: float | None,
) -> dict[str, float]:
    if previous is None or previous_timestamp_ms is None:
        return {
            **{name: 0.0 for name in _VELOCITY_SOURCES},
            **{name: 0.0 for name in _ACCELERATION_SOURCES},
        }
    delta_seconds = max((timestamp_ms - previous_timestamp_ms) / 1000.0, 1e-6)
    derivatives = {
        name: (current[source] - previous[source]) / delta_seconds
        for name, source in _VELOCITY_SOURCES.items()
    }
    derivatives.update(
        {
            name: (current[source] - previous[source]) / delta_seconds
            for name, source in _ACCELERATION_SOURCES.items()
        }
    )
    return derivatives


def extract_unified_features(
    dataframe: pd.DataFrame,
    landmark_ids: Iterable[int] = UNIFIED_LANDMARK_IDS,
    *,
    enable_head_pose_estimation: bool = True,
) -> UnifiedFeatureSeries:
    """Build a stable frame-by-feature matrix from raw MediaPipe landmarks."""
    required = {"frame_idx", "landmark_idx", "x", "y"}
    missing = required - set(dataframe.columns)
    if missing:
        raise ValueError(f"Raw landmark columns missing: {sorted(missing)}")
    ids = tuple(landmark_ids)
    frames = np.array(sorted(dataframe["frame_idx"].unique()), dtype=np.int64)
    values: list[list[float]] = []
    signal_rows: list[dict[str, float | int | bool]] = []
    timestamps: list[float] = []
    previous: dict[int, np.ndarray] | None = None
    previous_signals: dict[str, float] | None = None
    previous_timestamp_ms: float | None = None

    for frame_index in frames:
        rows = dataframe[dataframe["frame_idx"] == frame_index]
        first = rows.iloc[0]
        timestamp_ms = float(first.get("timestamp_ms", 0.0))
        face_detected = bool(first.get("face_detected", True))
        raw = {
            int(row.landmark_idx): np.array(
                [
                    float(row.x),
                    float(row.y),
                    _finite_float(getattr(row, "z", 0.0)),
                ],
                dtype=np.float32,
            )
            for row in rows.itertuples()
            if int(row.landmark_idx) >= 0
            and np.isfinite(float(row.x))
            and np.isfinite(float(row.y))
        }
        canonical = _canonicalize(raw)
        feature_row: list[float] = []
        for point_id in ids:
            point = canonical.get(point_id)
            if point is None:
                feature_row.extend((0.0, 0.0, 0.0, 0.0))
            else:
                feature_row.extend(
                    (float(point[0]), float(point[1]), float(point[2]), 1.0)
                )
        signal_values = _signals(raw, canonical, previous, face_detected)
        if not enable_head_pose_estimation:
            signal_values.update({"yaw": 0.0, "pitch": 0.0, "roll": 0.0})
        signal_values.update(_raw_frame_metrics(rows))
        signal_values.update(
            _temporal_derivatives(
                signal_values,
                previous_signals,
                timestamp_ms,
                previous_timestamp_ms,
            )
        )
        feature_row.extend(float(signal_values[name]) for name in CONTINUOUS_SIGNALS)
        values.append(feature_row)
        signal_rows.append(
            {
                "frameIndex": int(frame_index),
                "timestampMs": timestamp_ms,
                **signal_values,
            }
        )
        timestamps.append(timestamp_ms)
        previous = canonical if face_detected else None
        previous_signals = signal_values if face_detected else None
        previous_timestamp_ms = timestamp_ms if face_detected else None

    return UnifiedFeatureSeries(
        values=np.asarray(values, dtype=np.float32),
        frame_indices=frames,
        timestamps_ms=np.asarray(timestamps, dtype=np.float64),
        feature_names=unified_feature_names(ids),
        signals=signal_rows,
    )


def make_time_centered_windows(
    values: np.ndarray,
    timestamps_ms: np.ndarray,
    *,
    target_fps: float = 30.0,
    window_ms: float = 1000.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Create one fixed-size, centered temporal window for every source frame."""
    if len(values) != len(timestamps_ms):
        raise ValueError("values and timestamps_ms must have the same length")
    if not len(values):
        return np.empty((0, 0, 0), dtype=np.float32), np.empty(0, dtype=int)
    steps = max(3, int(round(window_ms / 1000.0 * target_fps)))
    if steps % 2 == 0:
        steps += 1
    offsets = np.linspace(-window_ms / 2.0, window_ms / 2.0, steps)
    windows = np.empty((len(values), steps, values.shape[1]), dtype=np.float32)
    source_positions = np.arange(len(values))
    for target_index, timestamp in enumerate(timestamps_ms):
        desired = timestamp + offsets
        right = np.searchsorted(timestamps_ms, desired, side="left")
        right = np.clip(right, 0, len(values) - 1)
        left = np.clip(right - 1, 0, len(values) - 1)
        choose_right = np.abs(timestamps_ms[right] - desired) < np.abs(
            timestamps_ms[left] - desired
        )
        selected = np.where(choose_right, right, left)
        windows[target_index] = values[selected]
    return windows, source_positions
