"""Independent Celery jobs for landmark extraction and model inference.

Landmark artifacts are committed before an inference job is queued. This keeps
MediaPipe output available even when no active model exists or inference fails.
"""
from __future__ import annotations

import gzip
import hashlib
import importlib.metadata
import io
import json
import logging
import os
import subprocess
import tempfile
from datetime import datetime
from typing import Any

from celery.utils.log import get_task_logger

from app.db.models import (
    JobStatus,
    JobType,
    LandmarkArtifact,
    Prediction,
    ProcessingJob,
    VideoAsset,
)
from app.db.session import SessionLocal
from app.core.config import settings
from app.services.model_service import get_active_model
from app.services.storage_service import storage_service
from app.workers.celery_app import celery_app
from cast.config.actions import ALL_ACTIONS
from cast.config.taxonomy import MULTI_ACTION_CODE

logger = get_task_logger(__name__)

EXTRACTOR_CONFIG: dict[str, Any] = {
    "refine_landmarks": True,
    "min_detection_confidence": 0.5,
    "min_tracking_confidence": 0.5,
    "normalization": "paper_formula",
    "overlay_chunk_seconds": 1,
    "enable_head_pose_estimation": True,
    "head_motion_schema": "head-motion-v1",
    "optical_flow": "farneback-roi-v1",
}


def _config_hash(config: dict[str, Any] | None = None) -> str:
    encoded = json.dumps(
        config or EXTRACTOR_CONFIG,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _extractor_config_for_video(video: VideoAsset) -> dict[str, Any]:
    config = dict(EXTRACTOR_CONFIG)
    try:
        organization = video.session.participant.study.project.organization
        organization_settings = organization.pipeline_settings or {}
    except AttributeError:
        organization_settings = {}
    if organization_settings.get("face_detection_threshold") is not None:
        config["min_detection_confidence"] = float(
            organization_settings["face_detection_threshold"]
        )
    if organization_settings.get("enable_head_pose_estimation") is not None:
        config["enable_head_pose_estimation"] = bool(
            organization_settings["enable_head_pose_estimation"]
        )
    if settings.FACE_LANDMARKER_V2_ENABLED:
        from app.domains.face.landmarker_v2 import MODEL_SHA256

        config.update({
            "extractor": "mediapipe_face_landmarker_v2",
            "running_mode": "VIDEO",
            "model_path": os.environ.get("FACE_LANDMARKER_MODEL_PATH", "/app/models/face_landmarker_v1.task"),
            "model_checksum": MODEL_SHA256,
            "output_face_blendshapes": True,
            "output_facial_transformation_matrixes": True,
        })
    else:
        config["extractor"] = "mediapipe_facemesh"
    return config


def _mediapipe_version() -> str:
    try:
        return importlib.metadata.version("mediapipe")
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


def _log_progress(
    db,
    job: ProcessingJob,
    level: str,
    message: str,
    progress: float | None = None,
) -> None:
    current_logs = list(job.logs) if job.logs else []
    current_logs.append(
        {
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "message": message,
        }
    )
    job.logs = current_logs
    if progress is not None:
        job.progress = progress
    db.commit()


def _download_video(video: VideoAsset) -> tuple[bytes, str]:
    if not video.storage_uri:
        raise ValueError("VideoAsset has no storage_uri")
    key = storage_service.key_from_uri(video.storage_uri)
    data = storage_service.download_bytes(key)
    return data, hashlib.sha256(data).hexdigest()


def _parquet_bytes(dataframe) -> bytes:
    buffer = io.BytesIO()
    dataframe.to_parquet(buffer, index=False, engine="pyarrow")
    return buffer.getvalue()


def _extract_landmarks(
    video_path: str,
    video_id: str,
    config: dict[str, Any] | None = None,
):
    """Run MediaPipe in its isolated dependency environment when available."""
    config = config or EXTRACTOR_CONFIG
    if config.get("extractor") == "mediapipe_face_landmarker_v2":
        from app.domains.face.landmarker_v2 import FaceLandmarkerV2

        landmarker = FaceLandmarkerV2(
            str(config["model_path"]),
            expected_sha256=str(config["model_checksum"]),
            min_confidence=float(config.get("min_detection_confidence", 0.5)),
        )
        tasks_python = os.environ.get("MEDIAPIPE_TASKS_PYTHON", "/opt/mediapipe-tasks/bin/python")
        if os.path.exists(tasks_python):
            return landmarker.extract_isolated(tasks_python, video_path, video_id)
        return landmarker.extract_from_video(video_path, video_id)
    legacy_python = os.environ.get(
        "MEDIAPIPE_PYTHON",
        "/opt/mediapipe-legacy/bin/python",
    )
    if not os.path.exists(legacy_python):
        from app.ml.facemesh import FaceMeshAdapter

        return FaceMeshAdapter(
            refine_landmarks=bool(config.get("refine_landmarks", True)),
            min_detection_confidence=float(
                config.get("min_detection_confidence", 0.5)
            ),
            min_tracking_confidence=float(
                config.get("min_tracking_confidence", 0.5)
            ),
        ).extract_from_video(video_path, video_id)

    import pandas as pd

    with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as output:
        output_path = output.name
    try:
        subprocess.run(
            [
                legacy_python,
                "-m",
                "cast.vision.extract_landmarks_one",
                "--video",
                video_path,
                "--video-id",
                video_id,
                "--output",
                output_path,
                "--min-detection-confidence",
                str(config.get("min_detection_confidence", 0.5)),
                "--min-tracking-confidence",
                str(config.get("min_tracking_confidence", 0.5)),
            ],
            check=True,
            cwd="/app",
            capture_output=True,
            text=True,
        )
        return pd.read_pickle(output_path)
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip() or error.stdout.strip() or str(error)
        raise RuntimeError(f"MediaPipe extraction failed: {detail}") from error
    finally:
        if os.path.exists(output_path):
            os.remove(output_path)


def _write_overlay_chunks(
    dataframe,
    *,
    prefix: str,
    fps: float,
) -> tuple[int, int, str]:
    chunk_size = max(1, round(fps))
    overlay_hasher = hashlib.sha256()
    frame_count = (
        int(dataframe["frame_idx"].max()) + 1 if not dataframe.empty else 0
    )
    for chunk_index, start_frame in enumerate(range(0, frame_count, chunk_size)):
        end_frame = min(frame_count, start_frame + chunk_size)
        chunk_rows = dataframe[
            (dataframe["frame_idx"] >= start_frame)
            & (dataframe["frame_idx"] < end_frame)
        ]
        frames = []
        for frame_index in range(start_frame, end_frame):
            rows = chunk_rows[chunk_rows["frame_idx"] == frame_index]
            if rows.empty:
                timestamp_ms = frame_index / fps * 1000.0
                face_detected = False
                points = []
            else:
                first = rows.iloc[0]
                timestamp_ms = float(first["timestamp_ms"])
                face_detected = bool(first["face_detected"])
                valid = rows[rows["landmark_idx"] >= 0]
                points = [
                    [
                        int(row.landmark_idx),
                        round(float(row.x), 7),
                        round(float(row.y), 7),
                    ]
                    for row in valid.itertuples()
                ]
            frames.append(
                {
                    "frameIndex": frame_index,
                    "timestampMs": round(timestamp_ms, 3),
                    "faceDetected": face_detected,
                    "points": points,
                }
            )
        payload = {
            "chunkIndex": chunk_index,
            "startFrame": start_frame,
            "endFrame": end_frame - 1,
            "frames": frames,
        }
        compressed = gzip.compress(
            json.dumps(payload, separators=(",", ":")).encode("utf-8")
        )
        overlay_hasher.update(compressed)
        storage_service.s3.put_object(
            Bucket=storage_service.bucket_name,
            Key=f"{prefix}/{chunk_index:06d}.json.gz",
            Body=compressed,
            ContentType="application/json",
            ContentEncoding="gzip",
        )
    return chunk_size, frame_count, overlay_hasher.hexdigest()


def _suggest_from_landmark_rules(
    db,
    job: ProcessingJob,
    artifact: LandmarkArtifact,
) -> dict[str, Any]:
    """Without an active model, annotators still get reviewable suggestions."""
    from app.services.heuristic_suggestion_service import (
        create_heuristic_prediction,
    )

    _log_progress(
        db,
        job,
        "info",
        "Nenhum modelo ativo; sugerindo eventos pela distância entre landmarks",
        50.0,
    )
    prediction, created = create_heuristic_prediction(db, artifact)
    counts = (prediction.summary or {}).get("event_counts", {})
    job.status = JobStatus.succeeded
    job.finished_at = datetime.utcnow()
    _log_progress(
        db,
        job,
        "info",
        (
            f"Sugestões por landmarks {'geradas' if created else 'reaproveitadas'}: "
            + ", ".join(f"{action} {count}" for action, count in counts.items())
        ),
        100.0,
    )
    return {"prediction_id": str(prediction.id), "source": "heuristic"}


def _queue_inference(db, artifact: LandmarkArtifact) -> ProcessingJob:
    infer_job = ProcessingJob(
        video_asset_id=artifact.video_asset_id,
        job_type=JobType.infer,
        status=JobStatus.queued,
    )
    db.add(infer_job)
    db.commit()
    db.refresh(infer_job)
    infer_landmarks_task.delay(str(infer_job.id), str(artifact.id))
    return infer_job


def _mark_failed(db, job: ProcessingJob | None, error: Exception) -> None:
    if job is None:
        return
    job.status = JobStatus.failed
    job.finished_at = datetime.utcnow()
    job.error_message = str(error)
    _log_progress(db, job, "error", f"Falha no processamento: {error}")


@celery_app.task(bind=True)
def extract_landmarks_task(self, job_id: str):
    """Extract, normalize and persist a versioned MediaPipe landmark artifact."""
    db = SessionLocal()
    tmp_video_path: str | None = None
    job: ProcessingJob | None = None
    artifact: LandmarkArtifact | None = None
    try:
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if job is None:
            return {"error": "Job not found"}
        job.status = JobStatus.running
        job.started_at = datetime.utcnow()
        job.worker_id = getattr(self.request, "hostname", None)
        _log_progress(db, job, "info", "Iniciando extração de landmarks", 5.0)

        video = job.video_asset
        if video is None:
            raise ValueError("ProcessingJob has no associated VideoAsset")

        video_bytes, checksum = _download_video(video)
        video.checksum_sha256 = checksum
        extractor_config = _extractor_config_for_video(video)
        config_hash = _config_hash(extractor_config)
        existing = (
            db.query(LandmarkArtifact)
            .filter(
                LandmarkArtifact.video_asset_id == video.id,
                LandmarkArtifact.video_checksum == checksum,
                LandmarkArtifact.config_hash == config_hash,
            )
            .order_by(LandmarkArtifact.created_at.desc())
            .first()
        )
        if existing is not None and existing.status == "ready":
            job.status = JobStatus.succeeded
            job.finished_at = datetime.utcnow()
            _log_progress(
                db,
                job,
                "info",
                f"Artefato idempotente reutilizado: {existing.id}",
                100.0,
            )
            # Reprocessing a video with ready landmarks still reruns inference,
            # so a newly activated model (or the landmark rules) takes effect.
            infer_job = _queue_inference(db, existing)
            return {
                "artifact_id": str(existing.id),
                "inference_job_id": str(infer_job.id),
                "reused": True,
            }

        fps = float(video.fps or 30.0)
        if existing is not None:
            artifact = existing
            artifact.processing_job_id = job.id
            artifact.status = "processing"
            artifact.error_message = None
            artifact.extractor_version = _mediapipe_version()
            artifact.extractor = str(extractor_config["extractor"])
            artifact.fps = fps
            artifact.updated_at = datetime.utcnow()
        else:
            artifact = LandmarkArtifact(
                video_asset_id=video.id,
                processing_job_id=job.id,
                status="processing",
                extractor=str(extractor_config["extractor"]),
                extractor_version=_mediapipe_version(),
                configuration=extractor_config,
                video_checksum=checksum,
                config_hash=config_hash,
                fps=fps,
            )
            db.add(artifact)
        db.flush()

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(video_bytes)
            tmp_video_path = tmp.name

        from app.ml.preprocessing import preprocess_landmarks

        _log_progress(db, job, "info", "Extraindo pontos com MediaPipe", 25.0)
        extraction = _extract_landmarks(
            tmp_video_path,
            str(video.id),
            extractor_config,
        )
        from app.domains.face.landmarker_v2 import FaceLandmarkerOutput

        if isinstance(extraction, FaceLandmarkerOutput):
            raw = extraction.landmarks
            face_features = extraction.features
            face_quality = extraction.quality
        else:
            raw = extraction
            face_features = None
            face_quality = None
        _log_progress(db, job, "info", "Normalizando coordenadas", 55.0)
        normalized = preprocess_landmarks(
            raw,
            mode=extractor_config["normalization"],
        )

        prefix = f"landmarks/{video.id}/{artifact.id}"
        raw_key = f"{prefix}/raw.parquet"
        normalized_key = f"{prefix}/normalized.parquet"
        overlay_prefix = f"{prefix}/overlay"
        raw_bytes = _parquet_bytes(raw)
        normalized_bytes = _parquet_bytes(normalized)
        storage_service.s3.put_object(
            Bucket=storage_service.bucket_name,
            Key=raw_key,
            Body=raw_bytes,
            ContentType="application/vnd.apache.parquet",
        )
        features_key = quality_key = None
        features_bytes = quality_bytes = None
        if face_features is not None and face_quality is not None:
            features_key = f"{prefix}/features.parquet"
            quality_key = f"{prefix}/quality.parquet"
            features_bytes = _parquet_bytes(face_features)
            quality_bytes = _parquet_bytes(face_quality)
            storage_service.s3.put_object(
                Bucket=storage_service.bucket_name, Key=features_key,
                Body=features_bytes, ContentType="application/vnd.apache.parquet",
            )
            storage_service.s3.put_object(
                Bucket=storage_service.bucket_name, Key=quality_key,
                Body=quality_bytes, ContentType="application/vnd.apache.parquet",
            )
        storage_service.s3.put_object(
            Bucket=storage_service.bucket_name,
            Key=normalized_key,
            Body=normalized_bytes,
            ContentType="application/vnd.apache.parquet",
        )
        chunk_size, frame_count, overlay_checksum = _write_overlay_chunks(
            raw,
            prefix=overlay_prefix,
            fps=fps,
        )

        if frame_count:
            detection_count = int(
                raw.groupby("frame_idx")["face_detected"].first().sum()
            )
            detection_rate = detection_count / frame_count
        else:
            detection_rate = 0.0
        point_count = int((raw["landmark_idx"] >= 0).sum()) if not raw.empty else 0

        artifact.status = "ready"
        artifact.frame_count = frame_count
        artifact.point_count = point_count
        artifact.face_detection_rate = detection_rate
        artifact.raw_uri = f"s3://{storage_service.bucket_name}/{raw_key}"
        artifact.normalized_uri = (
            f"s3://{storage_service.bucket_name}/{normalized_key}"
        )
        artifact.overlay_prefix = overlay_prefix
        artifact.raw_checksum = hashlib.sha256(raw_bytes).hexdigest()
        artifact.normalized_checksum = hashlib.sha256(
            normalized_bytes
        ).hexdigest()
        artifact.overlay_checksum = overlay_checksum
        artifact.capabilities = ["landmarks", "normalized", "mesh", "roi", "quality"]
        if features_key and quality_key and features_bytes is not None and quality_bytes is not None:
            artifact.capabilities.extend(["blendshapes-52", "facial-transformation-matrix", "head-pose", "eye-openness"])
            artifact.features_uri = f"s3://{storage_service.bucket_name}/{features_key}"
            artifact.features_checksum = hashlib.sha256(features_bytes).hexdigest()
            artifact.quality_uri = f"s3://{storage_service.bucket_name}/{quality_key}"
            artifact.quality_checksum = hashlib.sha256(quality_bytes).hexdigest()
            artifact.model_uri = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
            artifact.model_checksum = str(extractor_config["model_checksum"])
        artifact.chunk_size_frames = chunk_size
        artifact.updated_at = datetime.utcnow()

        from app.db.models import QualityVerdict
        from app.services.video_quality_service import assess_video_quality

        quality = assess_video_quality(
            detection_rate=detection_rate,
            n_frames=frame_count,
            fps=fps,
        )
        video.quality_verdict = QualityVerdict(quality["verdict"])
        video.quality_report = quality
        job.status = JobStatus.succeeded
        job.finished_at = datetime.utcnow()
        _log_progress(
            db,
            job,
            "info",
            (
                f"Landmarks persistidos: {frame_count} frames, "
                f"{point_count} pontos, detecção {detection_rate:.1%}"
            ),
            100.0,
        )

        infer_job = _queue_inference(db, artifact)

        from app.services.session_state_service import refresh_session_state

        refresh_session_state(db, video.session_id)
        return {
            "artifact_id": str(artifact.id),
            "inference_job_id": str(infer_job.id),
            "reused": False,
        }
    except Exception as error:
        logger.exception("Landmark extraction failed for job %s", job_id)
        db.rollback()
        if artifact is not None:
            artifact = (
                db.query(LandmarkArtifact)
                .filter(LandmarkArtifact.id == artifact.id)
                .first()
            )
            if artifact is not None:
                artifact.status = "failed"
                artifact.error_message = str(error)
                artifact.updated_at = datetime.utcnow()
        _mark_failed(db, job, error)
        return {"error": str(error)}
    finally:
        db.close()
        if tmp_video_path and os.path.exists(tmp_video_path):
            try:
                os.remove(tmp_video_path)
            except OSError:
                logging.warning("Could not remove temp video %s", tmp_video_path)


@celery_app.task(bind=True)
def infer_landmarks_task(self, job_id: str, artifact_id: str):
    """Run models from a persisted normalized artifact."""
    db = SessionLocal()
    job: ProcessingJob | None = None
    try:
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        artifact = (
            db.query(LandmarkArtifact)
            .filter(LandmarkArtifact.id == artifact_id)
            .first()
        )
        if job is None or artifact is None or artifact.status != "ready":
            raise ValueError("Ready LandmarkArtifact is required for inference")
        job.status = JobStatus.running
        job.started_at = datetime.utcnow()
        job.worker_id = getattr(self.request, "hostname", None)
        _log_progress(db, job, "info", "Carregando landmarks persistidos", 10.0)

        import numpy as np
        import pandas as pd

        try:
            unified_model, unified_manifest = get_active_model(
                db, MULTI_ACTION_CODE
            )
        except ValueError as error:
            unified_model = None
            unified_manifest = None
            _log_progress(
                db,
                job,
                "info",
                f"Modelo unificado indisponível; usando fallback V6: {error}",
            )

        if unified_model is not None and unified_manifest is not None:
            if not artifact.raw_uri:
                raise ValueError(
                    "RAW_LANDMARKS_NOT_READY: V7 requires raw 3D landmarks"
                )
            raw = pd.read_parquet(
                io.BytesIO(
                    storage_service.download_bytes(
                        storage_service.key_from_uri(artifact.raw_uri)
                    )
                ),
                engine="pyarrow",
            )
            from app.ml.unified_inference import run_unified_inference

            eeg_rows = None
            sync_mapping = None
            eeg_metadata = None
            if unified_manifest.architecture == "cast-multimodal-v8":
                from app.services.eeg_feature_service import (
                    load_session_eeg_features,
                )

                session_eeg = load_session_eeg_features(
                    db,
                    job.video_asset.session_id,
                )
                eeg_rows = session_eeg.rows
                sync_mapping = session_eeg.mapping
                eeg_metadata = {
                    "status": session_eeg.status,
                    "eeg_asset_id": session_eeg.eeg_asset_id,
                    "analysis_run_id": session_eeg.analysis_run_id,
                    "valid_ratio": session_eeg.valid_ratio,
                }
            result = run_unified_inference(
                raw,
                unified_model,
                unified_manifest,
                video_id=str(artifact.video_asset_id),
                fps=artifact.fps,
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
            payload = result.payload(str(artifact.id))
            key = (
                f"predictions/{artifact.video_asset_id}/"
                f"{result.request_id}/predictions.json"
            )
            storage_service.s3.put_object(
                Bucket=storage_service.bucket_name,
                Key=key,
                Body=json.dumps(
                    payload, separators=(",", ":")
                ).encode("utf-8"),
                ContentType="application/json",
            )
            legacy = result.legacy_summary()
            prediction = Prediction(
                video_asset_id=artifact.video_asset_id,
                prediction_uri=(
                    f"s3://{storage_service.bucket_name}/{key}"
                ),
                threshold=unified_manifest.threshold,
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
                },
            )
            db.add(prediction)
            job.status = JobStatus.succeeded
            job.finished_at = datetime.utcnow()
            _log_progress(
                db, job, "info", "Inferência unificada V7 finalizada", 100.0
            )
            db.refresh(prediction)
            return {
                "prediction_id": str(prediction.id),
                "schema": (
                    "v8"
                    if unified_manifest.architecture == "cast-multimodal-v8"
                    else "v7"
                ),
            }

        normalized = pd.read_parquet(
            io.BytesIO(
                storage_service.download_bytes(
                    storage_service.key_from_uri(artifact.normalized_uri)
                )
            ),
            engine="pyarrow",
        )
        models_by_action = {}
        manifests_by_action = {}
        model_version = None
        for action in ALL_ACTIONS:
            try:
                model, manifest = get_active_model(db, action)
                models_by_action[action] = model
                manifests_by_action[action] = manifest
                model_version = model_version or manifest.version
            except ValueError as error:
                _log_progress(
                    db,
                    job,
                    "warn",
                    f"Modelo não disponível para {action}: {error}",
                )
        if not models_by_action:
            return _suggest_from_landmark_rules(db, job, artifact)

        from app.ml.predictors import run_batch_predictions
        from cast.features.descriptors import build_video_descriptor

        result = run_batch_predictions(
            df_norm=normalized,
            models_by_action=models_by_action,
            manifests_by_action=manifests_by_action,
            video_id=str(artifact.video_asset_id),
            model_version=model_version or "unknown",
            fps=artifact.fps,
            actions=list(models_by_action),
        )
        predictions_by_action = {
            item.action: np.array(item.frame_predictions)
            for item in result.actions
            if item.error is None
        }
        descriptor = build_video_descriptor(predictions_by_action)
        payload = {
            "request_id": result.request_id,
            "video_id": str(artifact.video_asset_id),
            "landmark_artifact_id": str(artifact.id),
            "model_version": model_version,
            "fps": artifact.fps,
            "actions": [
                {
                    "action": item.action,
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
                }
                for item in result.actions
            ],
        }
        key = (
            f"predictions/{artifact.video_asset_id}/"
            f"{result.request_id}/predictions.json"
        )
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
                **descriptor,
                "landmark_artifact_id": str(artifact.id),
                "detection_rate": artifact.face_detection_rate,
                "total_frames": artifact.frame_count,
                "request_id": result.request_id,
                "latency_ms": result.total_latency_ms,
                "model_version": model_version,
            },
        )
        db.add(prediction)
        job.status = JobStatus.succeeded
        job.finished_at = datetime.utcnow()
        _log_progress(db, job, "info", "Inferência finalizada", 100.0)
        db.refresh(prediction)
        return {"prediction_id": str(prediction.id)}
    except Exception as error:
        logger.exception("Inference failed for job %s", job_id)
        db.rollback()
        _mark_failed(db, job, error)
        return {"error": str(error)}
    finally:
        db.close()


# Compatibility import for older callers. New code should use
# extract_landmarks_task explicitly.
process_video_task = extract_landmarks_task
