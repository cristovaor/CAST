"""Per-label hysteresis and interval compaction for CAST Unified V7."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

import numpy as np

from cast.config.taxonomy import (
    CORE_ACTIONS,
    EXPERIMENTAL_ACTIONS,
    HORIZONTAL_DIRECTIONS,
    VERTICAL_DIRECTIONS,
    default_postprocessing,
)


@dataclass(frozen=True)
class UnifiedEvent:
    action_code: str
    start_frame: int
    end_frame: int
    start_ms: float
    end_ms: float
    duration_ms: float
    confidence: float
    side: str = "unspecified"
    direction: dict[str, str] = field(default_factory=dict)
    subtype: str | None = None
    magnitude: float | None = None
    quality: dict[str, float | bool] = field(default_factory=dict)
    signals: dict[str, float] = field(default_factory=dict)

    def to_api(self) -> dict[str, Any]:
        payload = {
            "actionCode": self.action_code,
            "startFrame": self.start_frame,
            "endFrame": self.end_frame,
            "startTimeMs": self.start_ms,
            "endTimeMs": self.end_ms,
            "durationMs": self.duration_ms,
            "confidence": self.confidence,
            "side": self.side,
            "direction": self.direction,
            "subtype": self.subtype,
            "magnitude": self.magnitude,
            "quality": self.quality,
            "signals": self.signals,
        }
        return {key: value for key, value in payload.items() if value is not None}


def _ms_to_frames(value_ms: float, fps: float, minimum: int = 0) -> int:
    return max(minimum, int(round(value_ms / 1000.0 * fps)))


def _hysteresis_segments(
    probabilities: np.ndarray,
    face_detected: np.ndarray,
    *,
    enter_threshold: float,
    exit_threshold: float,
    max_missing_frames: int,
) -> list[tuple[int, int]]:
    segments: list[tuple[int, int]] = []
    active = False
    start = 0
    missing_run = 0
    for index, probability in enumerate(probabilities):
        if not bool(face_detected[index]):
            missing_run += 1
            if active and missing_run > max_missing_frames:
                segments.append((start, index - missing_run))
                active = False
            continue
        missing_run = 0
        if not active and probability >= enter_threshold:
            active = True
            start = index
        elif active and probability < exit_threshold:
            segments.append((start, index - 1))
            active = False
    if active:
        segments.append((start, len(probabilities) - 1))
    return [(start, end) for start, end in segments if end >= start]


def _merge_segments(
    segments: list[tuple[int, int]], merge_gap_frames: int
) -> list[tuple[int, int]]:
    if not segments:
        return []
    merged = [segments[0]]
    for start, end in segments[1:]:
        previous_start, previous_end = merged[-1]
        if start - previous_end - 1 <= merge_gap_frames:
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))
    return merged


def _dominant(
    probabilities: np.ndarray | None,
    labels: tuple[str, ...],
    start: int,
    end: int,
    dead_zone: float = 0.0,
) -> str:
    if probabilities is None or probabilities.size == 0:
        return "center"
    mean = probabilities[start : end + 1].mean(axis=0)
    best = int(np.argmax(mean))
    center = labels.index("center")
    if best != center and mean[best] - mean[center] < dead_zone:
        return "center"
    return labels[best]


def _split_on_sustained_direction(
    start: int,
    end: int,
    direction_arrays: tuple[np.ndarray | None, ...],
    *,
    minimum_run_frames: int,
    dead_zone: float,
) -> list[tuple[int, int]]:
    """Split an event when a new direction persists for a short stable run."""
    usable = [
        values
        for values in direction_arrays
        if values is not None and values.size and len(values) > end
    ]
    if not usable or end - start + 1 < minimum_run_frames * 2:
        return [(start, end)]

    signatures: list[tuple[int, ...]] = []
    for frame in range(start, end + 1):
        signature: list[int] = []
        for values in usable:
            row = values[frame]
            best = int(np.argmax(row))
            center = 1
            if best != center and row[best] - row[center] < dead_zone:
                best = center
            signature.append(best)
        signatures.append(tuple(signature))

    result: list[tuple[int, int]] = []
    segment_start = start
    current = signatures[0]
    offset = 1
    while offset < len(signatures):
        candidate = signatures[offset]
        if candidate == current:
            offset += 1
            continue
        run_end = offset + 1
        while run_end < len(signatures) and signatures[run_end] == candidate:
            run_end += 1
        if run_end - offset >= minimum_run_frames:
            split_frame = start + offset
            result.append((segment_start, split_frame - 1))
            segment_start = split_frame
            current = candidate
        offset = run_end
    result.append((segment_start, end))
    return [segment for segment in result if segment[0] <= segment[1]]


def _event_side(
    action: str,
    eye_side: np.ndarray | None,
    brow_side: np.ndarray | None,
    start: int,
    end: int,
    threshold: float = 0.5,
) -> str:
    values: np.ndarray | None
    indices: tuple[int, int]
    if action in {"OF", "SQUINT"}:
        values = eye_side
        indices = (0, 1) if action == "OF" else (2, 3)
    elif action in {"MSO", "BROW_RAISE", "BROW_FURROW"}:
        values = brow_side
        indices = (0, 1)
    elif action in {"ML", "SMILE", "MOUTH_OPEN", "LIP_PRESS", "LIP_PUCKER"}:
        return "center"
    elif action == "VR":
        return "whole"
    elif action == "OC":
        return "both"
    else:
        return "unspecified"
    if values is None or values.size == 0:
        return "both"
    means = values[start : end + 1, list(indices)].mean(axis=0)
    left, right = bool(means[0] >= threshold), bool(means[1] >= threshold)
    if left and right:
        return "both"
    if left:
        return "left"
    if right:
        return "right"
    return "unspecified"


def _subtype(action: str, side: str, duration_ms: float) -> str | None:
    if action == "OF":
        if side in {"left", "right"}:
            return "wink"
        return "blink" if duration_ms <= 400.0 else "sustained_closure"
    if action == "OC":
        return "gaze_shift"
    if action == "VR":
        return "head_movement"
    return None


def compact_unified_predictions(
    probabilities: Mapping[str, np.ndarray],
    frame_indices: np.ndarray,
    timestamps_ms: np.ndarray,
    *,
    fps: float,
    calibration: Mapping[str, Mapping[str, float]] | None = None,
    face_detected: np.ndarray | None = None,
    direction_probabilities: Mapping[str, np.ndarray] | None = None,
    side_probabilities: Mapping[str, np.ndarray] | None = None,
    signal_values: Mapping[str, np.ndarray] | None = None,
) -> list[UnifiedEvent]:
    """Compact all labels independently so simultaneous events are preserved."""
    if len(frame_indices) != len(timestamps_ms):
        raise ValueError("frame_indices and timestamps_ms must have equal length")
    detected = (
        np.asarray(face_detected, dtype=bool)
        if face_detected is not None
        else np.ones(len(frame_indices), dtype=bool)
    )
    config = default_postprocessing()
    if calibration:
        for label, overrides in calibration.items():
            config.setdefault(label, {}).update(overrides)
    directions = direction_probabilities or {}
    sides = side_probabilities or {}
    signals = signal_values or {}
    events: list[UnifiedEvent] = []

    for action in (*CORE_ACTIONS, *EXPERIMENTAL_ACTIONS):
        scores = np.asarray(probabilities.get(action, []), dtype=float)
        if not len(scores):
            continue
        if len(scores) != len(frame_indices):
            raise ValueError(f"Probability length mismatch for {action}")
        label_config = config[action]
        segments = _hysteresis_segments(
            scores,
            detected,
            enter_threshold=float(label_config["enter_threshold"]),
            exit_threshold=float(label_config["exit_threshold"]),
            max_missing_frames=_ms_to_frames(
                float(label_config["max_missing_ms"]), fps
            ),
        )
        segments = _merge_segments(
            segments,
            _ms_to_frames(float(label_config["merge_gap_ms"]), fps),
        )
        minimum_frames = _ms_to_frames(
            float(label_config["min_duration_ms"]), fps, minimum=1
        )
        direction_dead_zone = float(label_config.get("direction_dead_zone", 0.0))
        direction_run_frames = _ms_to_frames(100.0, fps, minimum=2)
        event_segments: list[tuple[int, int]] = []
        for start, end in segments:
            if action == "OC":
                event_segments.extend(
                    _split_on_sustained_direction(
                        start,
                        end,
                        (
                            directions.get("gaze_horizontal"),
                            directions.get("gaze_vertical"),
                        ),
                        minimum_run_frames=direction_run_frames,
                        dead_zone=direction_dead_zone,
                    )
                )
            elif action == "VR":
                event_segments.extend(
                    _split_on_sustained_direction(
                        start,
                        end,
                        (
                            directions.get("head_horizontal"),
                            directions.get("head_vertical"),
                            directions.get("head_tilt"),
                        ),
                        minimum_run_frames=direction_run_frames,
                        dead_zone=direction_dead_zone,
                    )
                )
            else:
                event_segments.append((start, end))

        for start, end in event_segments:
            if end - start + 1 < minimum_frames:
                continue
            start_ms = float(timestamps_ms[start])
            frame_duration_ms = 1000.0 / max(fps, 1e-8)
            end_ms = float(timestamps_ms[end] + frame_duration_ms)
            duration_ms = max(frame_duration_ms, end_ms - start_ms)
            side = _event_side(
                action,
                sides.get("eye_side"),
                sides.get("brow_side"),
                start,
                end,
            )
            direction: dict[str, str] = {}
            if action == "OC":
                direction = {
                    "horizontal": _dominant(
                        directions.get("gaze_horizontal"),
                        HORIZONTAL_DIRECTIONS,
                        start,
                        end,
                        direction_dead_zone,
                    ),
                    "vertical": _dominant(
                        directions.get("gaze_vertical"),
                        VERTICAL_DIRECTIONS,
                        start,
                        end,
                        direction_dead_zone,
                    ),
                }
            elif action == "VR":
                direction = {
                    "horizontal": _dominant(
                        directions.get("head_horizontal"),
                        HORIZONTAL_DIRECTIONS,
                        start,
                        end,
                        direction_dead_zone,
                    ),
                    "vertical": _dominant(
                        directions.get("head_vertical"),
                        VERTICAL_DIRECTIONS,
                        start,
                        end,
                        direction_dead_zone,
                    ),
                    "tilt": _dominant(
                        directions.get("head_tilt"),
                        HORIZONTAL_DIRECTIONS,
                        start,
                        end,
                        direction_dead_zone,
                    ),
                }
            event_signals = {
                name: round(float(np.mean(values[start : end + 1])), 6)
                for name, values in signals.items()
                if len(values) == len(frame_indices)
            }
            magnitude = (
                max((abs(value) for value in event_signals.values()), default=0.0)
                if event_signals
                else None
            )
            events.append(
                UnifiedEvent(
                    action_code=action,
                    start_frame=int(frame_indices[start]),
                    end_frame=int(frame_indices[end]),
                    start_ms=round(start_ms, 3),
                    end_ms=round(end_ms, 3),
                    duration_ms=round(duration_ms, 3),
                    confidence=round(float(scores[start : end + 1].mean()), 4),
                    side=side,
                    direction=direction,
                    subtype=_subtype(action, side, duration_ms),
                    magnitude=round(float(magnitude), 6)
                    if magnitude is not None
                    else None,
                    quality={
                        "faceDetectionRate": round(
                            float(detected[start : end + 1].mean()), 4
                        ),
                        "directionAmbiguous": bool(
                            action in {"OC", "VR"}
                            and all(value == "center" for value in direction.values())
                        ),
                    },
                    signals=event_signals,
                )
            )
    return sorted(events, key=lambda item: (item.start_frame, item.action_code))
