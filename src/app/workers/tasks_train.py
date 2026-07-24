"""Celery task that trains a micro-action model from annotated video data.

Pipeline: assemble windows from real annotations → train the canonical
cast-lstm-v6 architecture → evaluate on held-out videos → upload the .keras
artifact to MinIO → register it as a new (draft) ModelVersion.
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from celery.utils.log import get_task_logger

from app.db.models import JobStatus, ProcessingJob
from app.db.session import SessionLocal
from app.services.model_service import register_model_version
from app.services.storage_service import storage_service
from app.services.training_data_service import (
    InsufficientTrainingDataError,
    build_training_arrays,
)
from app.workers.celery_app import celery_app
from cast.config.settings import SEQUENCE_LENGTH, TRAINING_CONFIG

logger = get_task_logger(__name__)


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
    _log_progress(db, job, "error", f"Falha no treinamento: {error}")


def train_model(
    job_id: str,
    model_id: str,
    version: str,
    action: str,
    video_asset_ids: Optional[list[str]] = None,
    training_config: Optional[dict[str, Any]] = None,
) -> dict:
    """Synchronous core: assemble data → train → evaluate → upload → register."""
    db = SessionLocal()
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if job is None:
        db.close()
        return {"error": "Job not found"}

    try:
        job.status = JobStatus.running
        job.started_at = datetime.utcnow()
        db.commit()
        _log_progress(db, job, "info", f"Montando dados de treino anotados para ação {action}", 10.0)

        video_ids = [UUID(v) for v in video_asset_ids] if video_asset_ids else None
        X_train, y_train, X_val, y_val, feature_names = build_training_arrays(
            db, action, video_ids, sequence_length=SEQUENCE_LENGTH,
        )
        _log_progress(
            db, job, "info",
            f"Dados montados: {X_train.shape[0]} janelas de treino, {X_val.shape[0]} de validação",
            25.0,
        )

        config = {**TRAINING_CONFIG, **(training_config or {})}

        import tensorflow as tf
        from cast.models.evaluation import evaluate_frame_level, predict_action
        from cast.models.manifest import FrameLevelMetrics, ModelManifest, TrainingConfig
        from cast.models.training import train_model as run_training

        _log_progress(db, job, "info", "Treinando modelo (cast-lstm-v6)", 35.0)
        model, history = run_training(X_train, y_train, X_val, y_val, config)
        _log_progress(db, job, "info", "Treinamento concluído", 70.0)

        avg_metrics = None
        if X_val.shape[0] > 0:
            proba, pred = predict_action(model, X_val, threshold=config.get("threshold", 0.5))
            y_true = y_val.argmax(axis=1)
            metrics = evaluate_frame_level(y_true, pred)
            avg_metrics = FrameLevelMetrics(
                accuracy=metrics["accuracy"], precision=metrics["precision"],
                recall=metrics["recall"], f1=metrics["f1"], specificity=metrics["specificity"],
                tn=metrics["TN"], fp=metrics["FP"], fn=metrics["FN"], tp=metrics["TP"],
            )
            _log_progress(db, job, "info", f"Métricas de validação: f1={metrics['f1']:.3f}", 80.0)
        else:
            _log_progress(db, job, "warn", "Sem vídeos de validação — métricas não calculadas", 80.0)

        fd, tmp_path = tempfile.mkstemp(suffix=".keras")
        os.close(fd)
        try:
            model.save(tmp_path)
            with open(tmp_path, "rb") as f:
                artifact_bytes = f.read()
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        object_key = f"models/{model_id}/{version}/{action}.keras"
        storage_service.upload_bytes(object_key, artifact_bytes, "application/octet-stream")
        artifact_uri = f"s3://{storage_service.bucket_name}/{object_key}"
        _log_progress(db, job, "info", "Artefato enviado para o storage", 90.0)

        manifest = ModelManifest(
            model_id=model_id,
            version=version,
            action=action,
            feature_names=feature_names,
            feature_count=len(feature_names),
            sequence_length=SEQUENCE_LENGTH,
            threshold=config.get("threshold", 0.5),
            training_config=TrainingConfig(
                epochs=config.get("epochs", 40),
                batch_size=config.get("batch_size", 34),
                learning_rate=config.get("learning_rate", 0.0001),
                optimizer=config.get("optimizer", "adam"),
                early_stopping_patience=config.get("early_stopping_patience", 5),
                label_policy=config.get("label_policy", "last_frame_in_window"),
                seed=config.get("seed", 42),
            ),
            avg_metrics=avg_metrics,
            artifact_uri=artifact_uri,
        )

        model_version = register_model_version(
            db=db,
            model_id=model_id,
            version=version,
            action=action,
            manifest=manifest,
            artifact_uri=artifact_uri,
        )

        job.status = JobStatus.succeeded
        job.progress = 100.0
        job.finished_at = datetime.utcnow()
        job.result = {"model_version_id": str(model_version.id), "status": model_version.status}
        _log_progress(db, job, "info", f"Modelo registrado como draft (versão {model_version.id})", 100.0)

        return {"model_version_id": str(model_version.id)}
    except InsufficientTrainingDataError as error:
        logger.warning("Insufficient training data for job %s: %s", job_id, error)
        _mark_failed(db, job, error)
        return {"error": str(error)}
    except Exception as error:
        logger.exception("Training failed for job %s", job_id)
        db.rollback()
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if job is not None:
            _mark_failed(db, job, error)
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def train_model_task(
    self,
    job_id: str,
    model_id: str,
    version: str,
    action: str,
    video_asset_ids: Optional[list[str]] = None,
    training_config: Optional[dict[str, Any]] = None,
):
    return train_model(job_id, model_id, version, action, video_asset_ids, training_config)
