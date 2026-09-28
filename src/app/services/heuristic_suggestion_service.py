"""Annotation suggestions from landmark geometry when no model is active.

Heuristic suggestions are stored as a Prediction so the existing review flow
(accept, correct, reject) works unchanged, but they are marked with
``summary["source"] == "heuristic"`` and kept out of every place that reports
model output: timelines, descriptors, dashboards and study reports.
"""
from __future__ import annotations

import io
import json
import uuid
from typing import Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import LandmarkArtifact, Prediction, VideoAsset
from app.services.storage_service import storage_service

HEURISTIC_SOURCE = "heuristic"


def is_heuristic_prediction(prediction: Prediction) -> bool:
    return (prediction.summary or {}).get("source") == HEURISTIC_SOURCE


def model_predictions(predictions: Iterable[Prediction]) -> list[Prediction]:
    return [item for item in predictions if not is_heuristic_prediction(item)]


def _predictions_newest_first(db: Session, video_id: UUID) -> list[Prediction]:
    return (
        db.query(Prediction)
        .filter(Prediction.video_asset_id == video_id)
        .order_by(Prediction.created_at.desc())
        .all()
    )


def latest_model_prediction(db: Session, video_id: UUID) -> Prediction | None:
    return next(
        iter(model_predictions(_predictions_newest_first(db, video_id))), None
    )


def latest_suggestion_prediction(db: Session, video_id: UUID) -> Prediction | None:
    """The prediction whose events the annotator reviews: model output when
    any exists, otherwise the landmark heuristics."""
    predictions = _predictions_newest_first(db, video_id)
    return next(iter(model_predictions(predictions)), None) or next(
        iter(predictions), None
    )


def _read_raw_landmarks(artifact: LandmarkArtifact):
    import pandas as pd
    import pyarrow.parquet as pq

    from cast.heuristics.landmark_rules import REQUIRED_LANDMARKS

    buffer = io.BytesIO(
        storage_service.download_bytes(
            storage_service.key_from_uri(artifact.raw_uri)
        )
    )
    available = set(pq.ParquetFile(buffer).schema_arrow.names)
    buffer.seek(0)
    columns = [
        name
        for name in ("frame_idx", "landmark_idx", "x", "y", "z")
        if name in available
    ]
    # Only the points the rules use, plus the -1 rows of frames without a face.
    return pd.read_parquet(
        buffer,
        engine="pyarrow",
        columns=columns,
        filters=[("landmark_idx", "in", [-1, *REQUIRED_LANDMARKS])],
    )


def create_heuristic_prediction(
    db: Session,
    artifact: LandmarkArtifact,
) -> tuple[Prediction, bool]:
    """Store landmark-rule suggestions for a ready artifact.

    Returns (prediction, created). Re-running for the same artifact reuses the
    stored prediction, so reviews already made stay attached to its events.
    """
    from cast.heuristics.landmark_rules import (
        HEURISTIC_VERSION,
        detect_micro_actions,
    )

    for prediction in _predictions_newest_first(db, artifact.video_asset_id):
        summary = prediction.summary or {}
        if (
            is_heuristic_prediction(prediction)
            and summary.get("landmark_artifact_id") == str(artifact.id)
            and summary.get("model_version") == HEURISTIC_VERSION
        ):
            return prediction, False

    if not artifact.raw_uri:
        raise ValueError("RAW_LANDMARKS_NOT_READY: heuristics need raw landmarks")
    video = db.query(VideoAsset).filter(VideoAsset.id == artifact.video_asset_id).first()
    aspect_ratio = (
        video.width / video.height
        if video is not None and video.width and video.height
        else 1.0
    )
    fps = float(artifact.fps or 30.0)
    result = detect_micro_actions(
        _read_raw_landmarks(artifact),
        fps=fps,
        aspect_ratio=aspect_ratio,
    )
    request_id = str(uuid.uuid4())
    payload = {
        "source": HEURISTIC_SOURCE,
        "request_id": request_id,
        "video_id": str(artifact.video_asset_id),
        "landmark_artifact_id": str(artifact.id),
        "model_version": HEURISTIC_VERSION,
        "fps": fps,
        "events": [event.to_api() for event in result.events],
    }
    key = f"predictions/{artifact.video_asset_id}/{request_id}/predictions.json"
    storage_service.s3.put_object(
        Bucket=storage_service.bucket_name,
        Key=key,
        Body=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        ContentType="application/json",
    )
    prediction = Prediction(
        video_asset_id=artifact.video_asset_id,
        prediction_uri=f"s3://{storage_service.bucket_name}/{key}",
        threshold=0.5,
        summary={
            "source": HEURISTIC_SOURCE,
            "model_version": HEURISTIC_VERSION,
            "landmark_artifact_id": str(artifact.id),
            "detection_rate": artifact.face_detection_rate,
            "total_frames": artifact.frame_count,
            "request_id": request_id,
            **result.summary(),
        },
    )
    db.add(prediction)
    db.flush()
    return prediction, True
