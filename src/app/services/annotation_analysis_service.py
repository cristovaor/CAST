"""Landmark-based assistance for human video annotation."""

from __future__ import annotations

import gzip
import json
import math
import statistics
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db.models import LandmarkArtifact, VideoAsset
from app.services.storage_service import storage_service
from cast.config.actions import ACTION_REGIONS
from cast.config.landmarks import FACEMESH_REGIONS


@dataclass
class FrameGeometry:
    frame_index: int
    face_detected: bool
    points: dict[int, tuple[float, float]]


def _point_ids(action: str) -> set[int]:
    regions = ACTION_REGIONS.get(action)
    if not regions:
        return set()
    return {
        point_id
        for region in regions
        for point_id in FACEMESH_REGIONS.get(region, [])
    }


def _load_frames(
    artifact: LandmarkArtifact,
    first_frame: int,
    last_frame: int,
) -> list[FrameGeometry]:
    chunk_size = max(1, artifact.chunk_size_frames)
    first_chunk = max(0, first_frame // chunk_size)
    last_chunk = max(first_chunk, last_frame // chunk_size)
    frames: dict[int, FrameGeometry] = {}
    for chunk_index in range(first_chunk, last_chunk + 1):
        key = f"{artifact.overlay_prefix}/{chunk_index:06d}.json.gz"
        try:
            compressed = storage_service.download_bytes(key)
            payload = json.loads(gzip.decompress(compressed))
        except Exception:
            continue
        for frame in payload.get("frames", []):
            frame_index = int(frame["frameIndex"])
            if frame_index < first_frame or frame_index > last_frame:
                continue
            frames[frame_index] = FrameGeometry(
                frame_index=frame_index,
                face_detected=bool(frame.get("faceDetected")),
                points={
                    int(point_id): (float(x), float(y))
                    for point_id, x, y in frame.get("points", [])
                    if int(point_id) >= 0
                },
            )
    return [frames[index] for index in sorted(frames)]


def _motion(
    previous: FrameGeometry,
    current: FrameGeometry,
    point_ids: set[int],
) -> float | None:
    if not previous.face_detected or not current.face_detected:
        return None
    shared = point_ids & previous.points.keys() & current.points.keys()
    if not shared:
        return None
    distances = [
        math.hypot(
            current.points[point_id][0] - previous.points[point_id][0],
            current.points[point_id][1] - previous.points[point_id][1],
        )
        for point_id in shared
    ]
    return statistics.fmean(distances)


def _peak_frame(
    motion_by_frame: dict[int, float],
    target: int,
    radius: int,
) -> tuple[int, float]:
    candidates = [
        (frame_index, value)
        for frame_index, value in motion_by_frame.items()
        if target - radius <= frame_index <= target + radius
    ]
    if not candidates:
        return target, 0.0
    return max(candidates, key=lambda item: item[1])


def analyze_annotation_interval(
    db: Session,
    video: VideoAsset,
    action: str,
    start_frame: int,
    end_frame: int,
    search_radius: int = 6,
) -> dict:
    artifact = (
        db.query(LandmarkArtifact)
        .filter(
            LandmarkArtifact.video_asset_id == video.id,
            LandmarkArtifact.status == "ready",
        )
        .order_by(LandmarkArtifact.created_at.desc())
        .first()
    )
    if artifact is None or not artifact.overlay_prefix:
        return {
            "available": False,
            "reason": "landmarks_not_ready",
            "originalStartFrame": start_frame,
            "originalEndFrame": end_frame,
        }

    first_frame = max(0, start_frame - search_radius)
    last_frame = min(
        max(0, artifact.frame_count - 1),
        end_frame + search_radius,
    )
    frames = _load_frames(artifact, first_frame, last_frame)
    point_ids = _point_ids(action)
    motion_series: list[dict] = []
    motion_by_frame: dict[int, float] = {}
    for previous, current in zip(frames, frames[1:]):
        value = _motion(previous, current, point_ids)
        if value is None:
            continue
        motion_by_frame[current.frame_index] = value
        motion_series.append(
            {"frameIndex": current.frame_index, "motion": round(value, 7)}
        )

    suggested_start, start_peak = _peak_frame(
        motion_by_frame,
        start_frame,
        search_radius,
    )
    suggested_end, end_peak = _peak_frame(
        motion_by_frame,
        end_frame,
        search_radius,
    )
    if suggested_end < suggested_start:
        suggested_start, suggested_end = start_frame, end_frame

    interval_frames = [
        frame
        for frame in frames
        if start_frame <= frame.frame_index <= end_frame
    ]
    expected_count = max(1, end_frame - start_frame + 1)
    detected_count = sum(frame.face_detected for frame in interval_frames)
    face_detection_rate = detected_count / expected_count
    observed_point_counts = [
        len(point_ids & frame.points.keys())
        for frame in interval_frames
        if frame.face_detected
    ]
    expected_points = max(1, len(point_ids))
    point_coverage = (
        statistics.fmean(observed_point_counts) / expected_points
        if observed_point_counts
        else 0.0
    )
    values = list(motion_by_frame.values())
    median_motion = statistics.median(values) if values else 0.0
    max_motion = max(values, default=0.0)
    unstable = bool(
        values
        and max_motion > max(0.025, median_motion * 5)
    )
    warnings: list[dict] = []
    if face_detection_rate < 0.9:
        warnings.append(
            {
                "code": "face_missing",
                "severity": "warning",
                "message": (
                    "A face não foi detectada em todos os quadros do intervalo."
                ),
            }
        )
    if point_coverage < 0.8:
        warnings.append(
            {
                "code": "low_landmark_coverage",
                "severity": "warning",
                "message": "Parte dos landmarks da região está ausente.",
            }
        )
    if unstable:
        warnings.append(
            {
                "code": "unstable_tracking",
                "severity": "info",
                "message": (
                    "Há um salto atípico nos landmarks; revise o contorno."
                ),
            }
        )

    peak_reference = max(values, default=1.0)
    boundary_confidence = min(
        1.0,
        ((start_peak + end_peak) / 2) / peak_reference,
    )
    return {
        "available": True,
        "artifactId": str(artifact.id),
        "originalStartFrame": start_frame,
        "originalEndFrame": end_frame,
        "suggestedStartFrame": suggested_start,
        "suggestedEndFrame": suggested_end,
        "boundaryConfidence": round(boundary_confidence, 4),
        "motionSeries": motion_series,
        "quality": {
            "faceDetectionRate": round(face_detection_rate, 4),
            "pointCoverage": round(point_coverage, 4),
            "unstableTracking": unstable,
            "warnings": warnings,
        },
    }
