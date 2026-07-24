"""Celery task for end-to-end video processing.

Pipeline:
    1. Download video from MinIO
    2. Extract FaceMesh landmarks (MediaPipe)
    3. Normalize landmark coordinates
    4. Load active models for each action
    5. Run inference (via InferenceEngine)
    6. Compact events and compute descriptors
    7. Persist predictions to DB + MinIO
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import datetime

from celery.utils.log import get_task_logger

from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.db.models import ProcessingJob, JobStatus, VideoAsset, Prediction
from app.services.storage_service import storage_service
from app.services.model_service import get_active_model
from cast.config.landmarks import FACEMESH_REGIONS
from cast.config.actions import ALL_ACTIONS

logger = get_task_logger(__name__)


def _log_progress(
    db,
    job: ProcessingJob,
    level: str,
    message: str,
    progress: float | None = None,
) -> None:
    """Append a log entry to the processing job and commit."""
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


@celery_app.task(bind=True)
def process_video_task(self, job_id: str):
    """Process a video end-to-end: extract landmarks, run inference, save results."""
    db = SessionLocal()
    tmp_video_path = None

    try:
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if not job:
            db.close()
            return {"error": "Job not found"}

        job.status = JobStatus.running
        job.started_at = datetime.utcnow()
        _log_progress(db, job, "info", "Iniciando processamento E2E do vídeo", 5.0)

        video_asset: VideoAsset = job.video_asset
        if not video_asset:
            raise ValueError("ProcessingJob has no associated VideoAsset")

        from app.services.session_state_service import refresh_session_state
        refresh_session_state(db, video_asset.session_id)

        fps = float(video_asset.fps or 30.0)

        # ------------------------------------------------------------------
        # 1. Download video from MinIO
        # ------------------------------------------------------------------
        _log_progress(db, job, "info", "Baixando vídeo do storage (MinIO)", 10.0)
        if not video_asset.storage_uri:
            raise ValueError("VideoAsset has no storage_uri")

        object_key = video_asset.storage_uri.replace(
            f"s3://{storage_service.bucket_name}/", ""
        )
        response = storage_service.s3.get_object(
            Bucket=storage_service.bucket_name, Key=object_key
        )
        video_bytes = response["Body"].read()

        # Write to temp file for OpenCV/MediaPipe
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(video_bytes)
            tmp_video_path = tmp.name

        _log_progress(db, job, "info", f"Vídeo baixado ({len(video_bytes)//1024} KB)", 20.0)

        # ------------------------------------------------------------------
        # 2. FaceMesh landmark extraction
        # ------------------------------------------------------------------
        from app.ml.facemesh import FaceMeshAdapter
        _log_progress(db, job, "info", "Extraindo landmarks com MediaPipe FaceMesh", 30.0)
        extractor = FaceMeshAdapter()
        df_raw = extractor.extract_from_video(tmp_video_path)

        n_frames = df_raw["frame_idx"].nunique()
        face_detected_count = df_raw.groupby("frame_idx")["face_detected"].first().sum()
        detection_rate = float(face_detected_count) / max(n_frames, 1)

        _log_progress(
            db, job, "info",
            f"Landmarks extraídos: {n_frames} frames, "
            f"detecção facial: {detection_rate:.1%}",
            40.0,
        )

        # Persist a real quality assessment (docs §9) — never a bare score.
        from app.services.video_quality_service import assess_video_quality
        from app.db.models import QualityVerdict as _QV
        quality = assess_video_quality(detection_rate=detection_rate, n_frames=int(n_frames), fps=fps)
        video_asset.quality_verdict = _QV(quality["verdict"])
        video_asset.quality_report = quality
        db.commit()

        if detection_rate < 0.5:
            raise ValueError(
                f"Taxa de detecção facial muito baixa: {detection_rate:.1%} "
                f"(mínimo 50%)"
            )

        # ------------------------------------------------------------------
        # 3. Normalization
        # ------------------------------------------------------------------
        from app.ml.preprocessing import preprocess_landmarks
        _log_progress(db, job, "info", "Normalizando coordenadas (paper_formula)", 50.0)
        df_norm = preprocess_landmarks(df_raw, mode="paper_formula")

        # ------------------------------------------------------------------
        # 4. Load active models for each action
        # ------------------------------------------------------------------
        _log_progress(db, job, "info", "Carregando modelos ativos do registry", 55.0)
        models_by_action = {}
        manifests_by_action = {}
        active_model_version = None

        for action in ALL_ACTIONS:
            try:
                model, manifest = get_active_model(db, action)
                models_by_action[action] = model
                manifests_by_action[action] = manifest
                if active_model_version is None:
                    active_model_version = manifest.version
                _log_progress(db, job, "info", f"Modelo ativo carregado: {action} v{manifest.version}")
            except ValueError as e:
                _log_progress(db, job, "warn", f"Modelo não disponível para {action}: {e}")

        if not models_by_action:
            raise ValueError("MODEL_NOT_AVAILABLE: Nenhum modelo ativo encontrado")

        # ------------------------------------------------------------------
        # 5. Run inference via InferenceEngine
        # ------------------------------------------------------------------
        from app.ml.predictors import run_batch_predictions
        _log_progress(db, job, "info", "Iniciando inferência de micro-ações", 60.0)
        inference_result = run_batch_predictions(
            df_norm=df_norm,
            models_by_action=models_by_action,
            manifests_by_action=manifests_by_action,
            video_id=str(video_asset.id),
            model_version=active_model_version or "unknown",
            fps=fps,
            actions=list(models_by_action.keys()),
        )

        _log_progress(
            db, job, "info",
            f"Inferência concluída em {inference_result.total_latency_ms:.0f}ms "
            f"(status: {inference_result.status})",
            80.0,
        )

        # ------------------------------------------------------------------
        # 6. Build summary descriptor
        # ------------------------------------------------------------------
        import numpy as np
        from cast.features.descriptors import build_video_descriptor
        
        predictions_by_action = {
            ar.action: np.array(ar.frame_predictions)
            for ar in inference_result.actions
            if ar.error is None
        }
        descriptor = build_video_descriptor(predictions_by_action)

        # Build full events payload for MinIO storage
        events_payload = {
            "request_id": inference_result.request_id,
            "video_id": str(video_asset.id),
            "model_version": active_model_version,
            "fps": fps,
            "actions": [
                {
                    "action": ar.action,
                    "n_frames": ar.n_frames,
                    "n_windows": ar.n_windows,
                    "event_count": ar.event_count,
                    "events_per_minute": ar.events_per_minute,
                    "avg_confidence": ar.avg_confidence,
                    "latency_ms": ar.latency_ms,
                    "error": ar.error,
                    "events": [
                        {
                            "start_frame": e.start_frame,
                            "end_frame": e.end_frame,
                            "start_ms": e.start_ms,
                            "end_ms": e.end_ms,
                            "duration_ms": e.duration_ms,
                            "avg_confidence": e.avg_confidence,
                        }
                        for e in ar.events
                    ],
                }
                for ar in inference_result.actions
            ],
        }

        # ------------------------------------------------------------------
        # 7. Save predictions to MinIO + DB
        # ------------------------------------------------------------------
        _log_progress(db, job, "info", "Salvando predições no storage e banco de dados", 90.0)

        pred_key = f"predictions/{video_asset.id}/{inference_result.request_id}/predictions.json"
        pred_bytes = json.dumps(events_payload, indent=2).encode("utf-8")
        storage_service.s3.put_object(
            Bucket=storage_service.bucket_name,
            Key=pred_key,
            Body=pred_bytes,
            ContentType="application/json",
        )
        prediction_uri = f"s3://{storage_service.bucket_name}/{pred_key}"

        # Summary for DB (lightweight)
        summary = {
            **descriptor,
            "detection_rate": round(detection_rate, 4),
            "total_frames": n_frames,
            "request_id": inference_result.request_id,
            "latency_ms": inference_result.total_latency_ms,
        }

        prediction = Prediction(
            video_asset_id=video_asset.id,
            prediction_uri=prediction_uri,
            threshold=0.5,  # default; per-action thresholds stored in events_payload
            summary=summary,
        )
        db.add(prediction)

        job.status = JobStatus.succeeded
        job.finished_at = datetime.utcnow()
        _log_progress(db, job, "info", "Processamento E2E finalizado com sucesso!", 100.0)
        refresh_session_state(db, video_asset.session_id)

        return {
            "prediction_id": str(prediction.id),
            "descriptor": descriptor,
            "request_id": inference_result.request_id,
        }

    except Exception as e:
        logger.error(f"Error processing video job {job_id}: {e}", exc_info=True)
        if "job" in dir() and job:
            job.status = JobStatus.failed
            job.finished_at = datetime.utcnow()
            job.error_message = str(e)
            _log_progress(db, job, "error", f"Falha no processamento: {e}")
            if "video_asset" in dir() and video_asset:
                from app.services.session_state_service import refresh_session_state as _refresh
                _refresh(db, video_asset.session_id)
        db.commit()
        raise

    finally:
        db.close()
        if tmp_video_path and os.path.exists(tmp_video_path):
            os.unlink(tmp_video_path)
