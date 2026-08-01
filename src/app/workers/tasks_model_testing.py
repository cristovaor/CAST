"""Celery task to test a specific (possibly draft/candidate) model version
against chosen videos, without requiring it to be promoted to "active".
"""
from __future__ import annotations

import io
import json
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

import numpy as np

from celery.utils.log import get_task_logger

from app.db.models import (
    JobStatus,
    LandmarkArtifact,
    ModelVersion,
    Prediction,
    ProcessingJob,
    VideoAsset,
)
from app.db.session import SessionLocal
from app.services.model_service import ModelNotFoundError, get_model_by_version_id
from app.services.storage_service import storage_service
from app.workers.celery_app import celery_app
from cast.config.actions import MIN_RUN_LENGTH

logger = get_task_logger(__name__)

UNIFIED_ARCHITECTURES = frozenset({"cast-unified-v7", "cast-multimodal-v8"})


def _log_progress(db, job: ProcessingJob, level: str, message: str, progress: Optional[float] = None) -> None:
    current_logs = list(job.logs) if job.logs else []
    current_logs.append({
        "timestamp": datetime.utcnow().isoformat(),
        "level": level,
        "message": message,
    })
    job.logs = current_logs
    if progress is not None:
        job.progress = progress
    db.commit()


def _mark_failed(db, job: ProcessingJob, error: Exception) -> None:
    job.status = JobStatus.failed
    job.finished_at = datetime.utcnow()
    job.error_message = str(error)
    _log_progress(db, job, "error", f"Falha no teste do modelo: {error}")


def _serialize_action_result(item) -> dict:
    return {
        "action": item.action,
        "n_frames": item.n_frames,
        "n_windows": item.n_windows,
        "event_count": item.event_count,
        "events_per_minute": item.events_per_minute,
        "avg_confidence": item.avg_confidence,
        "latency_ms": item.latency_ms,
        "error": item.error,
        "events": [
            {
                "start_frame": event.start_frame,
                "end_frame": event.end_frame,
                "start_ms": event.start_ms,
                "end_ms": event.end_ms,
                "duration_ms": event.duration_ms,
                "avg_confidence": event.avg_confidence,
            }
            for event in item.events
        ],
        "frame_predictions": item.frame_predictions,
        "frame_probabilities": item.frame_probabilities,
        "frame_indices": item.frame_indices,
    }


def _is_unified_manifest(manifest) -> bool:
    return manifest.architecture in UNIFIED_ARCHITECTURES


def _landmark_uri_for_test(artifact, manifest) -> Optional[str]:
    if artifact is None:
        return None
    return artifact.raw_uri if _is_unified_manifest(manifest) else artifact.normalized_uri


def _unified_test_manifest(
    manifest,
    *,
    fps: float,
    threshold_override: Optional[float],
    min_run_length: Optional[int],
):
    """Apply test-only overrides to every V7/V8 observable label."""
    if threshold_override is None and min_run_length is None:
        return manifest

    labels = {
        *manifest.labels,
        *manifest.output_heads.get("actions", []),
        *manifest.output_heads.get("observable_movements", []),
    }
    calibration = {
        label: dict(values)
        for label, values in (manifest.postprocessing or manifest.calibration).items()
    }
    for label in labels:
        config = calibration.setdefault(label, {})
        if threshold_override is not None:
            config["enter_threshold"] = float(threshold_override)
            config["exit_threshold"] = float(threshold_override)
        if min_run_length is not None:
            config["min_duration_ms"] = (
                float(min_run_length) * 1000.0 / max(float(fps), 1e-8)
            )
    return manifest.model_copy(
        deep=True,
        update={"calibration": calibration, "postprocessing": calibration},
    )


def _serialize_unified_result(result) -> dict[str, Any]:
    event_count = len(result.events)
    duration_minutes = (
        max(float(result.timestamps_ms[-1] - result.timestamps_ms[0]), 0.0)
        / 60_000.0
        if len(result.timestamps_ms) > 1
        else 0.0
    )
    return {
        "action": "MULTI",
        "schema_version": result.schema_version,
        "n_frames": len(result.frame_indices),
        "n_windows": len(result.frame_indices),
        "event_count": event_count,
        "events_per_minute": round(
            event_count / max(duration_minutes, 1e-8), 4
        ),
        "avg_confidence": round(
            float(np.mean([event.confidence for event in result.events])), 4
        )
        if result.events
        else 0.0,
        "latency_ms": result.latency_ms,
        "events": [
            {
                "action_code": event.action_code,
                "start_frame": event.start_frame,
                "end_frame": event.end_frame,
                "start_ms": event.start_ms,
                "end_ms": event.end_ms,
                "duration_ms": event.duration_ms,
                "avg_confidence": event.confidence,
            }
            for event in result.events
        ],
        "frame_indices": result.frame_indices.tolist(),
        "actions": result.legacy_summary(),
        "modalities_used": list(result.modalities_used),
        "eeg_validation_status": result.eeg_validation_status,
    }


def _persist_prediction(db, artifact: LandmarkArtifact, mv: ModelVersion, result) -> None:
    from cast.features.descriptors import build_video_descriptor

    predictions_by_action = {
        item.action: np.array(item.frame_predictions)
        for item in result.actions
        if item.error is None
    }
    descriptor = build_video_descriptor(predictions_by_action)

    key = f"predictions/{artifact.video_asset_id}/{result.request_id}/predictions.json"
    payload = {
        "request_id": result.request_id,
        "video_id": str(artifact.video_asset_id),
        "landmark_artifact_id": str(artifact.id),
        "model_version": mv.version,
        "fps": artifact.fps,
        "actions": [_serialize_action_result(item) for item in result.actions],
    }
    storage_service.s3.put_object(
        Bucket=storage_service.bucket_name,
        Key=key,
        Body=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        ContentType="application/json",
    )

    db.add(Prediction(
        video_asset_id=artifact.video_asset_id,
        model_version_id=mv.id,
        prediction_uri=f"s3://{storage_service.bucket_name}/{key}",
        threshold=0.5,
        summary={
            **descriptor,
            "landmark_artifact_id": str(artifact.id),
            "detection_rate": artifact.face_detection_rate,
            "total_frames": artifact.frame_count,
            "request_id": result.request_id,
            "latency_ms": result.total_latency_ms,
            "model_version": mv.version,
            "test_run": True,
        },
    ))


def _persist_unified_prediction(
    db,
    artifact: LandmarkArtifact,
    mv: ModelVersion,
    result,
    *,
    threshold: float,
) -> None:
    key = f"predictions/{artifact.video_asset_id}/{result.request_id}/predictions.json"
    payload = result.payload(str(artifact.id))
    storage_service.s3.put_object(
        Bucket=storage_service.bucket_name,
        Key=key,
        Body=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        ContentType="application/json",
    )
    legacy = result.legacy_summary()
    db.add(Prediction(
        video_asset_id=artifact.video_asset_id,
        model_version_id=mv.id,
        prediction_uri=f"s3://{storage_service.bucket_name}/{key}",
        threshold=threshold,
        summary={
            "actions": legacy,
            **{
                label: values["total_events"]
                for label, values in legacy.items()
            },
            "schema_version": result.schema_version,
            "landmark_artifact_id": str(artifact.id),
            "detection_rate": artifact.face_detection_rate,
            "total_frames": artifact.frame_count,
            "request_id": result.request_id,
            "latency_ms": result.latency_ms,
            "model_version": result.model_version,
            "modalities_used": list(result.modalities_used),
            "sync_quality": result.sync_quality or {},
            "eeg_validation_status": result.eeg_validation_status,
            "test_run": True,
        },
    ))


def test_model_inference(
    job_id: str,
    model_version_id: str,
    video_asset_ids: list[str],
    threshold_override: Optional[float] = None,
    min_run_length: Optional[int] = None,
    persist_as_prediction: bool = False,
) -> dict:
    db = SessionLocal()
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if job is None:
        db.close()
        return {"error": "Job not found"}

    try:
        job.status = JobStatus.running
        job.started_at = datetime.utcnow()
        db.commit()
        _log_progress(db, job, "info", "Carregando versão do modelo", 5.0)

        model, manifest, mv = get_model_by_version_id(db, model_version_id)

        import pandas as pd
        from app.ml.inference_engine import run_action_inference

        results = []
        total = len(video_asset_ids) or 1
        for i, video_id in enumerate(video_asset_ids):
            progress = 10.0 + (80.0 * i / total)
            artifact = (
                db.query(LandmarkArtifact)
                .filter(LandmarkArtifact.video_asset_id == UUID(video_id), LandmarkArtifact.status == "ready")
                .order_by(LandmarkArtifact.created_at.desc())
                .first()
            )
            required_uri = _landmark_uri_for_test(artifact, manifest)
            if artifact is None or not required_uri:
                required_kind = (
                    "raw 3D"
                    if _is_unified_manifest(manifest)
                    else "normalized"
                )
                results.append({
                    "video_asset_id": video_id,
                    "status": "landmarks_not_ready",
                    "error": (
                        f"No ready {required_kind} landmark artifact found "
                        "for this video"
                    ),
                })
                continue

            _log_progress(db, job, "info", f"Rodando inferência de teste no vídeo {video_id}", progress)

            dataframe = pd.read_parquet(
                io.BytesIO(
                    storage_service.download_bytes(
                        storage_service.key_from_uri(required_uri)
                    )
                ),
                engine="pyarrow",
            )
            fps = artifact.fps or 30.0

            if _is_unified_manifest(manifest):
                from app.ml.unified_inference import run_unified_inference

                test_manifest = _unified_test_manifest(
                    manifest,
                    fps=fps,
                    threshold_override=threshold_override,
                    min_run_length=min_run_length,
                )
                eeg_rows = None
                sync_mapping = None
                eeg_metadata = None
                if manifest.architecture == "cast-multimodal-v8":
                    video = (
                        db.query(VideoAsset)
                        .filter(VideoAsset.id == artifact.video_asset_id)
                        .first()
                    )
                    if video is not None and video.session_id is not None:
                        from app.services.eeg_feature_service import (
                            load_session_eeg_features,
                        )

                        session_eeg = load_session_eeg_features(
                            db,
                            video.session_id,
                        )
                        eeg_rows = session_eeg.rows
                        sync_mapping = session_eeg.mapping
                        eeg_metadata = {
                            "status": session_eeg.status,
                            "eeg_asset_id": session_eeg.eeg_asset_id,
                            "analysis_run_id": session_eeg.analysis_run_id,
                            "valid_ratio": session_eeg.valid_ratio,
                        }
                try:
                    unified_result = run_unified_inference(
                        dataframe,
                        model,
                        test_manifest,
                        video_id=video_id,
                        fps=fps,
                        eeg_rows=eeg_rows,
                        sync_mapping=sync_mapping,
                        eeg_metadata=eeg_metadata,
                        enable_head_pose_estimation=bool(
                            (artifact.configuration or {}).get(
                                "enable_head_pose_estimation",
                                True,
                            )
                        ),
                    )
                except ValueError as error:
                    results.append({
                        "video_asset_id": video_id,
                        "status": "error",
                        "action": mv.action,
                        "error": str(error),
                    })
                    continue

                results.append({
                    "video_asset_id": video_id,
                    "status": "success",
                    "error": None,
                    **_serialize_unified_result(unified_result),
                })
                if persist_as_prediction:
                    _persist_unified_prediction(
                        db,
                        artifact,
                        mv,
                        unified_result,
                        threshold=(
                            float(threshold_override)
                            if threshold_override is not None
                            else manifest.threshold
                        ),
                    )
                    db.commit()
                continue

            action_result = run_action_inference(
                df_norm=dataframe,
                model=model,
                manifest=manifest,
                action=mv.action,
                fps=fps,
                threshold_override=threshold_override,
                min_run_length=min_run_length if min_run_length is not None else MIN_RUN_LENGTH,
            )

            results.append({
                "video_asset_id": video_id,
                "status": "error" if action_result.error else "success",
                **_serialize_action_result(action_result),
            })

            if persist_as_prediction and action_result.error is None:
                import uuid as _uuid
                from app.ml.inference_engine import InferenceRunResult
                run_result = InferenceRunResult(
                    request_id=str(_uuid.uuid4()),
                    video_id=video_id,
                    model_id=mv.model_id,
                    model_version=mv.version,
                    actions=[action_result],
                    total_latency_ms=action_result.latency_ms,
                )
                _persist_prediction(db, artifact, mv, run_result)
                db.commit()

        job.status = JobStatus.succeeded
        job.progress = 100.0
        job.finished_at = datetime.utcnow()
        job.result = {"model_version_id": model_version_id, "results": results}
        _log_progress(db, job, "info", "Teste do modelo concluído", 100.0)

        return {"model_version_id": model_version_id, "results": results}
    except ModelNotFoundError as error:
        _mark_failed(db, job, error)
        return {"error": str(error)}
    except Exception as error:
        logger.exception("Model test run failed for job %s", job_id)
        db.rollback()
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if job is not None:
            _mark_failed(db, job, error)
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def test_model_inference_task(
    self,
    job_id: str,
    model_version_id: str,
    video_asset_ids: list[str],
    threshold_override: Optional[float] = None,
    min_run_length: Optional[int] = None,
    persist_as_prediction: bool = False,
):
    return test_model_inference(
        job_id, model_version_id, video_asset_ids,
        threshold_override, min_run_length, persist_as_prediction,
    )
