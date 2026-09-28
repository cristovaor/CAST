"""Rule-based micro-action suggestions from MediaPipe landmark distances.

No trained model is involved. Every signal is a ratio of distances between
landmarks, so camera distance and image size cancel out, and every threshold
applies to the deviation from the same video's own baseline (median and MAD
over the frames with a detected face). Each participant's resting face and
head position therefore define "neutral". The events are suggestions for a
human to accept, correct or reject, never model predictions.

Directions are from the participant's point of view: "left" is towards the
participant's left eye, which keeps labels stable when the camera image is
mirrored. "down" is towards the bottom of the image.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import pandas as pd

from cast.config.landmarks import FACEMESH_REGIONS
from cast.config.taxonomy import CORE_ACTIONS
from cast.features.unified import LEFT_EYE_EAR, LEFT_IRIS, RIGHT_EYE_EAR, RIGHT_IRIS
from cast.postprocessing.unified import UnifiedEvent, compact_unified_predictions

HEURISTIC_VERSION = "heuristica-landmarks-v1"

NOSE_TIP = 1
UPPER_LIP_INNER, LOWER_LIP_INNER = 13, 14
MOUTH_CORNERS = (61, 291)
RIGHT_EYE_CORNERS = (33, 133)
LEFT_EYE_CORNERS = (362, 263)
RIGHT_BROW = tuple(FACEMESH_REGIONS["sobrancelha_direita"])
LEFT_BROW = tuple(FACEMESH_REGIONS["sobrancelha_esquerda"])
REQUIRED_LANDMARKS = tuple(
    sorted(
        {
            NOSE_TIP,
            UPPER_LIP_INNER,
            LOWER_LIP_INNER,
            *MOUTH_CORNERS,
            *RIGHT_EYE_CORNERS,
            *LEFT_EYE_CORNERS,
            *RIGHT_EYE_EAR,
            *LEFT_EYE_EAR,
            *RIGHT_IRIS,
            *LEFT_IRIS,
            *RIGHT_BROW,
            *LEFT_BROW,
        }
    )
)

# A frame's score is strength / (1 + strength), where strength 1 means the
# deviation just clears its threshold; events open at 0.5 and close below 0.4.
ENTER_SCORE = 0.5
EXIT_SCORE = 0.4

# Direction heads use (left|up, center, right|down); a positive deviation is
# "left" horizontally (towards the participant's left) and "down" vertically.
_LEFT, _CENTER, _RIGHT = 0, 1, 2
_UP, _DOWN = 0, 2


@dataclass(frozen=True)
class HeuristicConfig:
    # OF: eye aspect ratio below this fraction of the video's median.
    eye_closed_ratio: float = 0.6
    # Other deviations must clear both a robust z-score and an absolute
    # floor, so jitter on a very still face (tiny MAD) never becomes an event.
    robust_z: float = 3.0
    gaze_horizontal_min: float = 0.08  # iris offset / eye width
    gaze_vertical_min: float = 0.06  # iris offset / eye width
    mouth_open_min: float = 0.08  # inner lip gap / mouth width
    mouth_width_min: float = 0.06  # mouth width / inter-ocular distance
    brow_height_min: float = 0.04  # brow-to-eye distance / inter-ocular distance
    yaw_min: float = 0.15  # nose offset / inter-ocular distance, about 12 degrees
    pitch_min: float = 0.15
    roll_min: float = 0.14  # radians, about 8 degrees
    smoothing_frames: int = 3
    min_valid_frames: int = 10


@dataclass(frozen=True)
class HeuristicResult:
    events: list[UnifiedEvent]
    baselines: dict[str, dict[str, float]]
    frame_count: int
    face_detection_rate: float
    config: HeuristicConfig

    def summary(self) -> dict[str, Any]:
        counts = {action: 0 for action in CORE_ACTIONS}
        for event in self.events:
            counts[event.action_code] = counts.get(event.action_code, 0) + 1
        return {
            "heuristic_version": HEURISTIC_VERSION,
            "event_counts": counts,
            "baselines": self.baselines,
            "frame_count": self.frame_count,
            "face_detection_rate": round(self.face_detection_rate, 4),
            "config": asdict(self.config),
        }


def _landmark_tensor(
    raw: pd.DataFrame,
    ids: tuple[int, ...],
    aspect_ratio: float,
) -> tuple[np.ndarray, dict[int, int]]:
    """Return a [frames, ids, xyz] array in height units, NaN where missing."""
    frames = raw["frame_idx"].to_numpy(dtype=np.int64)
    frame_count = int(frames.max()) + 1 if frames.size else 0
    positions = {point: index for index, point in enumerate(ids)}
    lookup = np.full(max(ids) + 1, -1, dtype=np.int64)
    for point, index in positions.items():
        lookup[point] = index
    landmarks = raw["landmark_idx"].to_numpy(dtype=np.int64)
    in_range = (landmarks >= 0) & (landmarks < lookup.size)
    slots = np.full(landmarks.shape, -1, dtype=np.int64)
    slots[in_range] = lookup[landmarks[in_range]]
    x = raw["x"].to_numpy(dtype=float)
    y = raw["y"].to_numpy(dtype=float)
    z = (
        raw["z"].to_numpy(dtype=float)
        if "z" in raw.columns
        else np.zeros(len(raw), dtype=float)
    )
    keep = (slots >= 0) & np.isfinite(x) & np.isfinite(y)
    tensor = np.full((frame_count, len(ids), 3), np.nan)
    # MediaPipe normalizes x and z by image width and y by height; scaling
    # x and z by width/height makes distances isotropic.
    tensor[frames[keep], slots[keep]] = np.column_stack(
        (
            x[keep] * aspect_ratio,
            y[keep],
            np.where(np.isfinite(z[keep]), z[keep], 0.0) * aspect_ratio,
        )
    )
    return tensor, positions


def landmark_signals(
    raw: pd.DataFrame,
    *,
    aspect_ratio: float = 1.0,
) -> tuple[dict[str, np.ndarray], np.ndarray]:
    """Per-frame distance ratios between landmarks, plus a face-detected mask."""
    tensor, positions = _landmark_tensor(raw, REQUIRED_LANDMARKS, aspect_ratio)

    def point(index: int) -> np.ndarray:
        return tensor[:, positions[index]]

    def mean(indices: tuple[int, ...]) -> np.ndarray:
        return tensor[:, [positions[index] for index in indices]].mean(axis=1)

    def distance(a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.linalg.norm(a - b, axis=1)

    with np.errstate(invalid="ignore", divide="ignore"):
        right_outer = point(RIGHT_EYE_CORNERS[0])
        left_outer = point(LEFT_EYE_CORNERS[1])
        inter_ocular = distance(right_outer, left_outer)
        axis = left_outer[:, :2] - right_outer[:, :2]
        axis_length = np.linalg.norm(axis, axis=1)
        unit = axis / axis_length[:, None]
        # Normal pointing down the image whether or not the video is mirrored.
        flip = np.where(unit[:, 0] >= 0, 1.0, -1.0)
        normal = np.column_stack((-unit[:, 1] * flip, unit[:, 0] * flip))
        origin = (right_outer[:, :2] + left_outer[:, :2]) / 2.0

        def canonical(values: np.ndarray) -> np.ndarray:
            offset = values[:, :2] - origin
            return np.column_stack(
                ((offset * unit).sum(axis=1), (offset * normal).sum(axis=1))
            ) / axis_length[:, None]

        def eye_aspect_ratio(indices: tuple[int, ...]) -> np.ndarray:
            p1, p2, p3, p4, p5, p6 = (point(index) for index in indices)
            return (distance(p2, p6) + distance(p3, p5)) / (
                2.0 * distance(p1, p4)
            )

        def gaze(
            iris: tuple[int, ...], corners: tuple[int, int]
        ) -> tuple[np.ndarray, np.ndarray]:
            center = canonical(mean(iris))
            a, b = canonical(point(corners[0])), canonical(point(corners[1]))
            middle = (a + b) / 2.0
            width = np.abs(b[:, 0] - a[:, 0])
            return (
                (center[:, 0] - middle[:, 0]) / width,
                (center[:, 1] - middle[:, 1]) / width,
            )

        def brow_height(brow: tuple[int, ...], corners: tuple[int, int]) -> np.ndarray:
            # Eye corners, not lids, so blinking does not move the reference.
            eye = (point(corners[0]) + point(corners[1])) / 2.0
            return distance(mean(brow), eye) / inter_ocular

        gaze_right = gaze(RIGHT_IRIS, RIGHT_EYE_CORNERS)
        gaze_left = gaze(LEFT_IRIS, LEFT_EYE_CORNERS)
        mouth_width = distance(point(MOUTH_CORNERS[0]), point(MOUTH_CORNERS[1]))
        nose = canonical(point(NOSE_TIP))
        signals = {
            "eye_open_right": eye_aspect_ratio(RIGHT_EYE_EAR),
            "eye_open_left": eye_aspect_ratio(LEFT_EYE_EAR),
            "gaze_horizontal": (gaze_right[0] + gaze_left[0]) / 2.0,
            "gaze_vertical": (gaze_right[1] + gaze_left[1]) / 2.0,
            "mouth_open": distance(
                point(UPPER_LIP_INNER), point(LOWER_LIP_INNER)
            ) / mouth_width,
            "mouth_width": mouth_width / inter_ocular,
            "brow_height_right": brow_height(RIGHT_BROW, RIGHT_EYE_CORNERS),
            "brow_height_left": brow_height(LEFT_BROW, LEFT_EYE_CORNERS),
            "yaw": nose[:, 0],
            "pitch": nose[:, 1],
            "roll": np.arctan2(unit[:, 1], np.abs(unit[:, 0])),
        }
    detected = (
        np.isfinite(inter_ocular)
        & (inter_ocular > 0)
        & np.isfinite(axis_length)
        & (axis_length > 0)
    )
    return (
        {
            name: np.where(detected & np.isfinite(values), values, np.nan)
            for name, values in signals.items()
        },
        detected,
    )


def _smooth(values: np.ndarray, detected: np.ndarray, window: int) -> np.ndarray:
    if window <= 1:
        return values
    smoothed = (
        pd.Series(values)
        .rolling(window, center=True, min_periods=1)
        .median()
        .to_numpy()
    )
    return np.where(detected, smoothed, np.nan)


def _baseline(values: np.ndarray) -> tuple[float, float]:
    sample = values[np.isfinite(values)]
    if sample.size == 0:
        return float("nan"), float("nan")
    median = float(np.median(sample))
    spread = 1.4826 * float(np.median(np.abs(sample - median)))
    return median, spread


def _strength(
    deviation: np.ndarray,
    spread: float,
    minimum: float,
    robust_z: float,
) -> np.ndarray:
    magnitude = np.abs(deviation)
    by_floor = magnitude / minimum
    if spread > 0:
        by_z = magnitude / (robust_z * spread)
        strength = np.minimum(by_floor, by_z)
    else:
        strength = by_floor
    return np.where(np.isfinite(strength), strength, 0.0)


def _score(strength: np.ndarray) -> np.ndarray:
    return strength / (1.0 + strength)


def _one_hot(
    deviation: np.ndarray,
    active: np.ndarray,
    positive_index: int,
    negative_index: int,
) -> np.ndarray:
    heads = np.zeros((len(deviation), 3))
    heads[:, _CENTER] = 1.0
    for mask, index in (
        (active & (deviation > 0), positive_index),
        (active & (deviation < 0), negative_index),
    ):
        heads[mask] = 0.0
        heads[mask, index] = 1.0
    return heads


def _postprocessing() -> dict[str, dict[str, float]]:
    overrides = {
        action: {"enter_threshold": ENTER_SCORE, "exit_threshold": EXIT_SCORE}
        for action in CORE_ACTIONS
    }
    # Speech moves the lips in bursts; join them into one reviewable event.
    overrides["ML"]["merge_gap_ms"] = 250.0
    return overrides


def detect_micro_actions(
    raw: pd.DataFrame,
    *,
    fps: float,
    aspect_ratio: float = 1.0,
    config: HeuristicConfig | None = None,
) -> HeuristicResult:
    """Suggest OF, OC, ML, MSO and VR events from raw MediaPipe landmarks."""
    config = config or HeuristicConfig()
    if raw.empty:
        return HeuristicResult([], {}, 0, 0.0, config)
    raw_signals, detected = landmark_signals(raw, aspect_ratio=aspect_ratio)
    frame_count = len(detected)
    detection_rate = float(detected.mean()) if frame_count else 0.0
    if int(detected.sum()) < config.min_valid_frames:
        return HeuristicResult([], {}, frame_count, detection_rate, config)

    signals = {
        name: _smooth(values, detected, config.smoothing_frames)
        for name, values in raw_signals.items()
    }
    baselines = {name: _baseline(values) for name, values in signals.items()}
    deviation = {
        name: signals[name] - baselines[name][0] for name in signals
    }

    def strength(name: str, minimum: float) -> np.ndarray:
        return _strength(
            deviation[name], baselines[name][1], minimum, config.robust_z
        )

    with np.errstate(invalid="ignore", divide="ignore"):
        closure_right = np.nan_to_num(
            (1.0 - signals["eye_open_right"] / baselines["eye_open_right"][0])
            / (1.0 - config.eye_closed_ratio)
        ).clip(min=0.0)
        closure_left = np.nan_to_num(
            (1.0 - signals["eye_open_left"] / baselines["eye_open_left"][0])
            / (1.0 - config.eye_closed_ratio)
        ).clip(min=0.0)
    eyes_open = (closure_right < 1.0) & (closure_left < 1.0)

    gaze_horizontal = np.where(
        eyes_open, strength("gaze_horizontal", config.gaze_horizontal_min), 0.0
    )
    gaze_vertical = np.where(
        eyes_open, strength("gaze_vertical", config.gaze_vertical_min), 0.0
    )
    mouth = np.maximum(
        strength("mouth_open", config.mouth_open_min),
        strength("mouth_width", config.mouth_width_min),
    )
    brow_right = strength("brow_height_right", config.brow_height_min)
    brow_left = strength("brow_height_left", config.brow_height_min)
    yaw = strength("yaw", config.yaw_min)
    pitch = strength("pitch", config.pitch_min)
    roll = strength("roll", config.roll_min)

    def signal_values(*names: str) -> dict[str, np.ndarray]:
        return {
            f"{name}_deviation": np.nan_to_num(deviation[name]) for name in names
        }

    frame_indices = np.arange(frame_count)
    timestamps_ms = frame_indices / max(fps, 1e-8) * 1000.0
    calibration = _postprocessing()
    detections: list[tuple[str, np.ndarray, dict[str, Any]]] = [
        (
            "OF",
            np.maximum(closure_right, closure_left),
            {
                "side_probabilities": {
                    "eye_side": np.column_stack(
                        (_score(closure_left), _score(closure_right))
                    )
                },
                "signal_values": {
                    "eye_closure_left": closure_left
                    * (1.0 - config.eye_closed_ratio),
                    "eye_closure_right": closure_right
                    * (1.0 - config.eye_closed_ratio),
                },
            },
        ),
        (
            "OC",
            np.maximum(gaze_horizontal, gaze_vertical),
            {
                "direction_probabilities": {
                    "gaze_horizontal": _one_hot(
                        deviation["gaze_horizontal"],
                        gaze_horizontal >= 1.0,
                        _LEFT,
                        _RIGHT,
                    ),
                    "gaze_vertical": _one_hot(
                        deviation["gaze_vertical"],
                        gaze_vertical >= 1.0,
                        _DOWN,
                        _UP,
                    ),
                },
                "signal_values": signal_values(
                    "gaze_horizontal", "gaze_vertical"
                ),
            },
        ),
        (
            "ML",
            mouth,
            {"signal_values": signal_values("mouth_open", "mouth_width")},
        ),
        (
            "VR",
            np.maximum.reduce((yaw, pitch, roll)),
            {
                "direction_probabilities": {
                    "head_horizontal": _one_hot(
                        deviation["yaw"], yaw >= 1.0, _LEFT, _RIGHT
                    ),
                    "head_vertical": _one_hot(
                        deviation["pitch"], pitch >= 1.0, _DOWN, _UP
                    ),
                    "head_tilt": _one_hot(
                        deviation["roll"], roll >= 1.0, _LEFT, _RIGHT
                    ),
                },
                "signal_values": signal_values("yaw", "pitch", "roll"),
            },
        ),
        (
            "MSO",
            np.maximum(brow_right, brow_left),
            {
                "side_probabilities": {
                    "brow_side": np.column_stack(
                        (_score(brow_left), _score(brow_right))
                    )
                },
                "signal_values": signal_values(
                    "brow_height_left", "brow_height_right"
                ),
            },
        ),
    ]
    events: list[UnifiedEvent] = []
    for action, action_strength, extras in detections:
        events.extend(
            compact_unified_predictions(
                {action: np.where(detected, _score(action_strength), 0.0)},
                frame_indices,
                timestamps_ms,
                fps=fps,
                calibration=calibration,
                face_detected=detected,
                **extras,
            )
        )
    events.sort(key=lambda item: (item.start_frame, item.action_code))
    return HeuristicResult(
        events=events,
        baselines={
            name: {
                "median": round(median, 6),
                "spread": round(spread, 6),
            }
            for name, (median, spread) in baselines.items()
            if np.isfinite(median)
        },
        frame_count=frame_count,
        face_detection_rate=detection_rate,
        config=config,
    )
