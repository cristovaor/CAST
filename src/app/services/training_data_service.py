"""Assembles supervised training arrays for a micro-action from annotated videos.

Combines persisted normalized landmarks (LandmarkArtifact.normalized_uri) with
human-annotated intervals (AnnotationEvent) to produce per-frame binary labels,
then windows them the same way inference does (cast.features.windowing).
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from uuid import UUID

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import (
    AnnotationEvent,
    AnnotationTask,
    LandmarkArtifact,
    Participant,
    Session as SessionModel,
    VideoAsset,
)
from app.services.storage_service import storage_service
from cast.config.actions import ACTION_REGIONS
from cast.config.landmarks import get_points
from cast.config.settings import SEQUENCE_LENGTH
from cast.features.regions import extract_features_for_action
from cast.features.windowing import make_windows
from cast.config.taxonomy import (
    CONTINUOUS_SIGNALS,
    CORE_ACTIONS,
    EXPERIMENTAL_ACTIONS,
    HORIZONTAL_DIRECTIONS,
    UNIFIED_ACTIONS,
    VERTICAL_DIRECTIONS,
)
from cast.features.unified import (
    extract_unified_features,
    make_time_centered_windows,
)
from cast.features.multimodal import (
    build_multimodal_windows,
    extract_eeg_features,
    modality_dropout,
)


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


@dataclass(frozen=True)
class UnifiedTrainingArrays:
    X_train: np.ndarray
    y_train: Dict[str, np.ndarray]
    sample_weight_train: Dict[str, np.ndarray]
    X_val: np.ndarray
    y_val: Dict[str, np.ndarray]
    sample_weight_val: Dict[str, np.ndarray]
    feature_names: List[str]
    train_video_ids: List[str]
    val_video_ids: List[str]


@dataclass(frozen=True)
class MultimodalTrainingArrays:
    head_train: np.ndarray
    eeg_train: np.ndarray
    eeg_present_train: np.ndarray
    y_train: Dict[str, np.ndarray]
    sample_weight_train: Dict[str, np.ndarray]
    head_val: np.ndarray
    eeg_val: np.ndarray
    eeg_present_val: np.ndarray
    y_val: Dict[str, np.ndarray]
    sample_weight_val: Dict[str, np.ndarray]
    head_feature_names: List[str]
    eeg_feature_names: List[str]
    train_video_ids: List[str]
    val_video_ids: List[str]
    eeg_session_count: int

    def train_inputs(self) -> Dict[str, np.ndarray]:
        return {
            "head_sequence": self.head_train,
            "eeg_sequence": self.eeg_train,
            "eeg_present": self.eeg_present_train,
        }

    def val_inputs(self) -> Dict[str, np.ndarray]:
        return {
            "head_sequence": self.head_val,
            "eeg_sequence": self.eeg_val,
            "eeg_present": self.eeg_present_val,
        }


def _split_by_participant(
    db: Session,
    video_ids: List[UUID],
    val_split: float,
) -> tuple[set[UUID], set[UUID]]:
    """Hold out complete participants so sessions never leak across splits."""
    rows = (
        db.query(VideoAsset.id, SessionModel.participant_id)
        .join(SessionModel, VideoAsset.session_id == SessionModel.id)
        .filter(VideoAsset.id.in_(video_ids))
        .all()
    )
    by_participant: Dict[UUID, List[UUID]] = {}
    for video_id, participant_id in rows:
        by_participant.setdefault(participant_id, []).append(video_id)
    participant_ids = sorted(by_participant, key=str)
    n_val = (
        max(1, round(len(participant_ids) * val_split))
        if len(participant_ids) > 1
        else 0
    )
    val_participants = set(participant_ids[-n_val:]) if n_val else set()
    val_ids = {
        video_id
        for participant_id in val_participants
        for video_id in by_participant[participant_id]
    }
    return set(video_ids) - val_ids, val_ids


def eligible_video_ids_for_unified(db: Session) -> List[UUID]:
    return [
        row[0]
        for row in (
            db.query(VideoAsset.id)
            .join(LandmarkArtifact, LandmarkArtifact.video_asset_id == VideoAsset.id)
            .join(AnnotationTask, AnnotationTask.video_asset_id == VideoAsset.id)
            .join(AnnotationEvent, AnnotationEvent.task_id == AnnotationTask.id)
            .filter(LandmarkArtifact.status == "ready")
            .filter(AnnotationEvent.action.in_(UNIFIED_ACTIONS))
            .distinct()
            .all()
        )
    ]


def _direction_index(value: str | None, labels: tuple[str, ...]) -> int | None:
    return labels.index(value) if value in labels else None


def _unified_targets_for_video(
    db: Session,
    video_id: UUID,
    frame_indices: np.ndarray,
    signal_targets: np.ndarray,
    face_detected: np.ndarray,
) -> tuple[Dict[str, np.ndarray], Dict[str, np.ndarray]]:
    n_frames = len(frame_indices)
    core = np.zeros((n_frames, len(CORE_ACTIONS)), dtype=np.float32)
    extras = np.zeros(
        (n_frames, len(EXPERIMENTAL_ACTIONS)), dtype=np.float32
    )
    eye_side = np.zeros((n_frames, 4), dtype=np.float32)
    brow_side = np.zeros((n_frames, 2), dtype=np.float32)
    eye_side_weight = np.zeros(n_frames, dtype=np.float32)
    brow_side_weight = np.zeros(n_frames, dtype=np.float32)
    direction_heads = {
        name: np.zeros((n_frames, 3), dtype=np.float32)
        for name in (
            "gaze_horizontal",
            "gaze_vertical",
            "head_horizontal",
            "head_vertical",
            "head_tilt",
        )
    }
    direction_weights = {
        name: np.zeros(n_frames, dtype=np.float32)
        for name in direction_heads
    }
    frame_to_row = {int(frame): index for index, frame in enumerate(frame_indices)}
    events = (
        db.query(AnnotationEvent)
        .join(AnnotationTask, AnnotationEvent.task_id == AnnotationTask.id)
        .filter(AnnotationTask.video_asset_id == video_id)
        .filter(AnnotationEvent.action.in_(UNIFIED_ACTIONS))
        .all()
    )
    for event in events:
        rows = [
            frame_to_row[frame]
            for frame in range(
                int(event.start_frame or 0), int(event.end_frame or 0) + 1
            )
            if frame in frame_to_row
        ]
        if not rows:
            continue
        action = event.action
        if action in CORE_ACTIONS:
            core[rows, CORE_ACTIONS.index(action)] = 1.0
        elif action in EXPERIMENTAL_ACTIONS:
            extras[rows, EXPERIMENTAL_ACTIONS.index(action)] = 1.0
        side = event.side or "unspecified"
        if action == "OF":
            if side in {"left", "right", "both"}:
                eye_side_weight[rows] = 1.0
            if side in {"left", "both"}:
                eye_side[rows, 0] = 1.0
            if side in {"right", "both"}:
                eye_side[rows, 1] = 1.0
        elif action == "SQUINT":
            if side in {"left", "right", "both"}:
                eye_side_weight[rows] = 1.0
            if side in {"left", "both"}:
                eye_side[rows, 2] = 1.0
            if side in {"right", "both"}:
                eye_side[rows, 3] = 1.0
        elif action in {"MSO", "BROW_RAISE", "BROW_FURROW"}:
            if side in {"left", "right", "both"}:
                brow_side_weight[rows] = 1.0
            if side in {"left", "both"}:
                brow_side[rows, 0] = 1.0
            if side in {"right", "both"}:
                brow_side[rows, 1] = 1.0

        metadata = event.spatial_metadata or {}
        direction = metadata.get("direction") or {}
        if action == "OC":
            mappings = (
                ("gaze_horizontal", direction.get("horizontal"), HORIZONTAL_DIRECTIONS),
                ("gaze_vertical", direction.get("vertical"), VERTICAL_DIRECTIONS),
            )
        elif action == "VR":
            mappings = (
                ("head_horizontal", direction.get("horizontal"), HORIZONTAL_DIRECTIONS),
                ("head_vertical", direction.get("vertical"), VERTICAL_DIRECTIONS),
                ("head_tilt", direction.get("tilt"), HORIZONTAL_DIRECTIONS),
            )
        else:
            mappings = ()
        for head, value, labels in mappings:
            index = _direction_index(value, labels)
            if index is not None:
                direction_heads[head][rows, index] = 1.0
                direction_weights[head][rows] = 1.0

    targets = {
        "actions": core,
        "observable_movements": extras,
        "eye_side": eye_side,
        "brow_side": brow_side,
        **direction_heads,
        "signals": signal_targets.astype(np.float32),
    }
    weights = {
        "actions": np.ones(n_frames, dtype=np.float32),
        "observable_movements": np.ones(n_frames, dtype=np.float32),
        "eye_side": eye_side_weight,
        "brow_side": brow_side_weight,
        **direction_weights,
        "signals": face_detected.astype(np.float32),
    }
    return targets, weights


def build_unified_training_arrays(
    db: Session,
    video_asset_ids: Optional[List[UUID]] = None,
    *,
    target_fps: float = 30.0,
    window_ms: float = 1000.0,
    val_split: float = 0.2,
    validation_video_ids: Optional[List[UUID]] = None,
) -> UnifiedTrainingArrays:
    """Assemble multirrótulo targets and one shared feature schema by video."""
    ids = sorted(
        video_asset_ids or eligible_video_ids_for_unified(db),
        key=str,
    )
    if not ids:
        raise InsufficientTrainingDataError(
            "No annotated videos with ready landmarks found for unified training"
        )
    if validation_video_ids is None:
        train_ids, val_ids = _split_by_participant(db, ids, val_split)
    else:
        val_ids = set(validation_video_ids) & set(ids)
        train_ids = set(ids) - val_ids
    buckets: dict[str, list] = {
        "train_X": [],
        "val_X": [],
        "train_y": [],
        "val_y": [],
        "train_w": [],
        "val_w": [],
    }
    feature_names: List[str] | None = None

    for video_id in ids:
        artifact = (
            db.query(LandmarkArtifact)
            .filter(
                LandmarkArtifact.video_asset_id == video_id,
                LandmarkArtifact.status == "ready",
            )
            .order_by(LandmarkArtifact.created_at.desc())
            .first()
        )
        if artifact is None or not artifact.raw_uri:
            continue
        raw = pd.read_parquet(
            io.BytesIO(
                storage_service.download_bytes(
                    storage_service.key_from_uri(artifact.raw_uri)
                )
            ),
            engine="pyarrow",
        )
        features = extract_unified_features(
            raw,
            enable_head_pose_estimation=bool(
                (artifact.configuration or {}).get(
                    "enable_head_pose_estimation",
                    True,
                )
            ),
        )
        windows, _ = make_time_centered_windows(
            features.values,
            features.timestamps_ms,
            target_fps=target_fps,
            window_ms=window_ms,
        )
        if not len(windows):
            continue
        feature_names = features.feature_names
        signal_targets = features.values[:, -len(CONTINUOUS_SIGNALS) :]
        face_detected = np.asarray(
            [bool(row["face_detected"]) for row in features.signals]
        )
        targets, weights = _unified_targets_for_video(
            db,
            video_id,
            features.frame_indices,
            signal_targets,
            face_detected,
        )
        prefix = "val" if video_id in val_ids else "train"
        buckets[f"{prefix}_X"].append(windows)
        buckets[f"{prefix}_y"].append(targets)
        buckets[f"{prefix}_w"].append(weights)

    if not buckets["train_X"] or feature_names is None:
        raise InsufficientTrainingDataError(
            "No usable unified training windows were assembled"
        )

    def merge_dicts(items: list[Dict[str, np.ndarray]]) -> Dict[str, np.ndarray]:
        if not items:
            return {}
        return {
            key: np.concatenate([item[key] for item in items], axis=0)
            for key in items[0]
        }

    X_train = np.concatenate(buckets["train_X"], axis=0)
    X_val = (
        np.concatenate(buckets["val_X"], axis=0)
        if buckets["val_X"]
        else np.empty((0, X_train.shape[1], X_train.shape[2]), dtype=np.float32)
    )
    return UnifiedTrainingArrays(
        X_train=X_train,
        y_train=merge_dicts(buckets["train_y"]),
        sample_weight_train=merge_dicts(buckets["train_w"]),
        X_val=X_val,
        y_val=merge_dicts(buckets["val_y"]),
        sample_weight_val=merge_dicts(buckets["val_w"]),
        feature_names=feature_names,
        train_video_ids=[str(item) for item in ids if item in train_ids],
        val_video_ids=[str(item) for item in ids if item in val_ids],
    )


def build_multimodal_training_arrays(
    db: Session,
    video_asset_ids: Optional[List[UUID]] = None,
    *,
    target_fps: float = 30.0,
    head_window_ms: float = 1000.0,
    eeg_window_ms: float = 8000.0,
    val_split: float = 0.2,
    eeg_dropout_probability: float = 0.25,
    seed: int = 42,
    min_eeg_sessions: int = 2,
    min_eeg_valid_ratio: float = 0.70,
) -> MultimodalTrainingArrays:
    """Assemble participant-disjoint V8 tensors with EEG as optional input."""
    from app.services.eeg_feature_service import load_session_eeg_features

    ids = sorted(
        video_asset_ids or eligible_video_ids_for_unified(db),
        key=str,
    )
    if not ids:
        raise InsufficientTrainingDataError(
            "No annotated videos with ready landmarks found for multimodal training"
        )
    train_ids, val_ids = _split_by_participant(db, ids, val_split)
    buckets: dict[str, list] = {
        f"{prefix}_{name}": []
        for prefix in ("train", "val")
        for name in ("head", "eeg", "present", "y", "w")
    }
    head_feature_names: List[str] | None = None
    eeg_feature_names: List[str] | None = None
    eeg_sessions = 0

    for video_id in ids:
        video = db.query(VideoAsset).filter(VideoAsset.id == video_id).first()
        artifact = (
            db.query(LandmarkArtifact)
            .filter(
                LandmarkArtifact.video_asset_id == video_id,
                LandmarkArtifact.status == "ready",
            )
            .order_by(LandmarkArtifact.created_at.desc())
            .first()
        )
        if video is None or artifact is None or not artifact.raw_uri:
            continue
        raw = pd.read_parquet(
            io.BytesIO(
                storage_service.download_bytes(
                    storage_service.key_from_uri(artifact.raw_uri)
                )
            ),
            engine="pyarrow",
        )
        head_features = extract_unified_features(
            raw,
            enable_head_pose_estimation=bool(
                (artifact.configuration or {}).get(
                    "enable_head_pose_estimation",
                    True,
                )
            ),
        )
        session_eeg = load_session_eeg_features(db, video.session_id)
        eeg_quality_approved = bool(
            session_eeg.status == "ready"
            and session_eeg.valid_ratio is not None
            and session_eeg.valid_ratio >= min_eeg_valid_ratio
        )
        eeg_series = extract_eeg_features(
            session_eeg.rows if eeg_quality_approved else []
        )
        windows = build_multimodal_windows(
            head_features.values,
            head_features.timestamps_ms,
            eeg_series=eeg_series,
            sync_mapping=(
                session_eeg.mapping
                if eeg_quality_approved
                else {"approved": False}
            ),
            target_fps=target_fps,
            head_window_ms=head_window_ms,
            eeg_window_ms=eeg_window_ms,
        )
        if not len(windows.head):
            continue
        if np.any(windows.eeg_present):
            eeg_sessions += 1
        head_feature_names = head_features.feature_names
        eeg_feature_names = windows.eeg_feature_names
        signal_targets = head_features.values[:, -len(CONTINUOUS_SIGNALS) :]
        face_detected = np.asarray(
            [bool(row["face_detected"]) for row in head_features.signals]
        )
        targets, weights = _unified_targets_for_video(
            db,
            video_id,
            head_features.frame_indices,
            signal_targets,
            face_detected,
        )
        prefix = "val" if video_id in val_ids else "train"
        buckets[f"{prefix}_head"].append(windows.head)
        buckets[f"{prefix}_eeg"].append(windows.eeg)
        buckets[f"{prefix}_present"].append(windows.eeg_present)
        buckets[f"{prefix}_y"].append(targets)
        buckets[f"{prefix}_w"].append(weights)

    if not buckets["train_head"] or head_feature_names is None or eeg_feature_names is None:
        raise InsufficientTrainingDataError(
            "No usable multimodal training windows were assembled"
        )
    if eeg_sessions < min_eeg_sessions:
        raise InsufficientTrainingDataError(
            f"Multimodal training requires at least {min_eeg_sessions} approved "
            f"EEG sessions with valid_ratio >= {min_eeg_valid_ratio:.2f}; "
            f"found {eeg_sessions}"
        )

    def concatenate(name: str, prefix: str) -> np.ndarray:
        items = buckets[f"{prefix}_{name}"]
        if items:
            return np.concatenate(items, axis=0)
        train_shape = np.concatenate(buckets[f"train_{name}"], axis=0).shape
        return np.empty((0, *train_shape[1:]), dtype=np.float32)

    def merge_dicts(prefix: str, name: str) -> Dict[str, np.ndarray]:
        items = buckets[f"{prefix}_{name}"]
        if not items:
            return {}
        return {
            key: np.concatenate([item[key] for item in items], axis=0)
            for key in items[0]
        }

    head_train = concatenate("head", "train")
    eeg_train = concatenate("eeg", "train")
    present_train = concatenate("present", "train")
    present_train = modality_dropout(
        present_train,
        probability=eeg_dropout_probability,
        seed=seed,
    )
    return MultimodalTrainingArrays(
        head_train=head_train,
        eeg_train=eeg_train,
        eeg_present_train=present_train,
        y_train=merge_dicts("train", "y"),
        sample_weight_train=merge_dicts("train", "w"),
        head_val=concatenate("head", "val"),
        eeg_val=concatenate("eeg", "val"),
        eeg_present_val=concatenate("present", "val"),
        y_val=merge_dicts("val", "y"),
        sample_weight_val=merge_dicts("val", "w"),
        head_feature_names=head_feature_names,
        eeg_feature_names=eeg_feature_names,
        train_video_ids=[str(item) for item in ids if item in train_ids],
        val_video_ids=[str(item) for item in ids if item in val_ids],
        eeg_session_count=eeg_sessions,
    )
