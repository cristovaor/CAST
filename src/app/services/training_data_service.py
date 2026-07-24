"""Assembles supervised training arrays for a micro-action from annotated videos.

Combines persisted normalized landmarks (LandmarkArtifact.normalized_uri) with
human-annotated intervals (AnnotationEvent) to produce per-frame binary labels,
then windows them the same way inference does (cast.features.windowing).
"""
from __future__ import annotations

import io
from typing import List, Optional, Tuple
from uuid import UUID

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import AnnotationEvent, AnnotationTask, LandmarkArtifact, VideoAsset
from app.services.storage_service import storage_service
from cast.config.actions import ACTION_REGIONS
from cast.config.landmarks import get_points
from cast.config.settings import SEQUENCE_LENGTH
from cast.features.regions import extract_features_for_action
from cast.features.windowing import make_windows


class InsufficientTrainingDataError(Exception):
    pass


def feature_names_for_action(action: str) -> List[str]:
    """Canonical ordered feature names, matching extract_features_for_action's column order."""
    regions = ACTION_REGIONS.get(action, [])
    points = get_points(regions)
    names: List[str] = []
    for lm_idx in points:
        names.append(f"lm_{lm_idx}_x")
        names.append(f"lm_{lm_idx}_y")
    return names


def eligible_video_ids_for_action(db: Session, action: str) -> List[UUID]:
    """Videos with a ready landmark artifact and at least one annotation for the action."""
    return [
        row[0]
        for row in (
            db.query(VideoAsset.id)
            .join(LandmarkArtifact, LandmarkArtifact.video_asset_id == VideoAsset.id)
            .join(AnnotationTask, AnnotationTask.video_asset_id == VideoAsset.id)
            .join(AnnotationEvent, AnnotationEvent.task_id == AnnotationTask.id)
            .filter(LandmarkArtifact.status == "ready")
            .filter(AnnotationEvent.action == action)
            .distinct()
            .all()
        )
    ]


def _labels_for_video(db: Session, video_asset_id: UUID, action: str, frame_count: int) -> np.ndarray:
    """Binary per-frame label array (1 = action occurring), built from annotated intervals."""
    y = np.zeros(frame_count, dtype=np.int64)
    events = (
        db.query(AnnotationEvent)
        .join(AnnotationTask, AnnotationEvent.task_id == AnnotationTask.id)
        .filter(AnnotationTask.video_asset_id == video_asset_id)
        .filter(AnnotationEvent.action == action)
        .all()
    )
    for event in events:
        start = max(0, int(event.start_frame or 0))
        end = min(frame_count - 1, int(event.end_frame or 0))
        if end >= start:
            y[start : end + 1] = 1
    return y


def _one_hot(y: np.ndarray) -> np.ndarray:
    out = np.zeros((y.shape[0], 2), dtype=np.float32)
    out[np.arange(y.shape[0]), y] = 1.0
    return out


def build_training_arrays(
    db: Session,
    action: str,
    video_asset_ids: Optional[List[UUID]] = None,
    sequence_length: int = SEQUENCE_LENGTH,
    val_split: float = 0.2,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, List[str]]:
    """Builds (X_train, y_train, X_val, y_val, feature_names) for one action.

    Splits by video (not by frame) so validation videos are fully held out.
    """
    ids = video_asset_ids or eligible_video_ids_for_action(db, action)
    if not ids:
        raise InsufficientTrainingDataError(
            f"No annotated videos with ready landmarks found for action {action}"
        )

    feature_names = feature_names_for_action(action)
    n_val = max(1, round(len(ids) * val_split)) if len(ids) > 1 else 0
    val_ids = set(ids[:n_val])

    train_windows: List[np.ndarray] = []
    train_labels: List[np.ndarray] = []
    val_windows: List[np.ndarray] = []
    val_labels: List[np.ndarray] = []

    for video_id in ids:
        artifact = (
            db.query(LandmarkArtifact)
            .filter(LandmarkArtifact.video_asset_id == video_id, LandmarkArtifact.status == "ready")
            .order_by(LandmarkArtifact.created_at.desc())
            .first()
        )
        if artifact is None or not artifact.normalized_uri:
            continue

        normalized = pd.read_parquet(
            io.BytesIO(
                storage_service.download_bytes(storage_service.key_from_uri(artifact.normalized_uri))
            ),
            engine="pyarrow",
        )
        X, frames = extract_features_for_action(normalized, action, "roi_features")
        if len(frames) <= sequence_length:
            continue

        frame_count = int(max(frames)) + 1
        y_per_frame = _labels_for_video(db, video_id, action, frame_count)
        y_aligned = y_per_frame[frames]

        X_windows, y_windows, _ = make_windows(X, _one_hot(y_aligned), sequence_length)
        if X_windows.size == 0:
            continue

        if video_id in val_ids:
            val_windows.append(X_windows)
            val_labels.append(y_windows)
        else:
            train_windows.append(X_windows)
            train_labels.append(y_windows)

    if not train_windows:
        raise InsufficientTrainingDataError(
            f"No usable training windows assembled for action {action}"
        )

    X_train = np.concatenate(train_windows, axis=0)
    y_train = np.concatenate(train_labels, axis=0)
    X_val = np.concatenate(val_windows, axis=0) if val_windows else np.empty((0, sequence_length, X_train.shape[2]), dtype=np.float32)
    y_val = np.concatenate(val_labels, axis=0) if val_labels else np.empty((0, 2), dtype=np.float32)

    return X_train, y_train, X_val, y_val, feature_names
