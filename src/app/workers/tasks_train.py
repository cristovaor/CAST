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

import numpy as np
from celery.utils.log import get_task_logger

from app.db.models import JobStatus, ProcessingJob
from app.db.session import SessionLocal
from app.services.model_service import register_model_version
from app.services.storage_service import storage_service
from app.services.training_data_service import (
    InsufficientTrainingDataError,
    build_multimodal_training_arrays,
    build_training_arrays,
    build_unified_training_arrays,
    eligible_video_ids_for_unified,
)
from app.workers.celery_app import celery_app
from cast.config.settings import SEQUENCE_LENGTH, TRAINING_CONFIG
from cast.config.taxonomy import (
    MULTI_ACTION_CODE,
    UNIFIED_ACTIONS,
    default_postprocessing,
)

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


def _train_unified(
    db,
    job: ProcessingJob,
    *,
    model_id: str,
    version: str,
    video_ids: Optional[list[UUID]],
    config: dict[str, Any],
) -> dict:
    """Train, calibrate and register one multi-task V7 artifact."""
    from cast.models.manifest import ModelManifest, TrainingConfig
    from cast.models.unified_classifier import unified_output_heads
    from cast.models.unified_training import (
        UNIFIED_LABELS,
        calibrate_high_recall_thresholds,
        train_unified_model,
    )

    target_fps = float(config.get("target_fps", 30.0))
    window_ms = float(config.get("window_ms", 1000.0))
    development_ids = sorted(
        video_ids or eligible_video_ids_for_unified(db),
        key=str,
    )
    use_loov = bool(config.get("leave_one_video_out", True)) and len(
        development_ids
    ) >= 3
    _log_progress(
        db,
        job,
        "info",
        "Montando dados multirrótulo e atributos espaciais",
        10.0,
    )
    arrays = build_unified_training_arrays(
        db,
        development_ids,
        target_fps=target_fps,
        window_ms=window_ms,
        validation_video_ids=(
            [development_ids[0]]
            if use_loov
            else None
        ),
    )
    _log_progress(
        db,
        job,
        "info",
        (
            f"Dados V7: {arrays.X_train.shape[0]} janelas de treino, "
            f"{arrays.X_val.shape[0]} de validação"
        ),
        15.0 if use_loov else 25.0,
    )
    model, _ = train_unified_model(
        arrays.X_train,
        arrays.y_train,
        arrays.sample_weight_train,
        arrays.X_val,
        arrays.y_val,
        arrays.sample_weight_val,
        config,
    )
    _log_progress(
        db,
        job,
        "info",
        "Primeiro fold V7 treinado" if use_loov else "Modelo unificado treinado",
        20.0 if use_loov else 70.0,
    )

    postprocessing = default_postprocessing()
    metrics_by_label: dict[str, dict[str, float]] = {}
    if len(arrays.X_val):
        prediction = model.predict(arrays.X_val, verbose=0)
        core_probability = prediction["actions"]
        extra_probability = prediction["observable_movements"]
        y_true = np.concatenate(
            (
                arrays.y_val["actions"],
                arrays.y_val["observable_movements"],
            ),
            axis=1,
        )
        y_probability = np.concatenate(
            (core_probability, extra_probability),
            axis=1,
        )
        postprocessing, metrics_by_label = calibrate_high_recall_thresholds(
            y_true,
            y_probability,
            UNIFIED_LABELS,
            target_recall=float(config.get("target_recall", 0.90)),
        )
        met_count = sum(
            bool(item["target_recall_met"])
            for label, item in metrics_by_label.items()
            if label in UNIFIED_ACTIONS[:5]
        )
        _log_progress(
            db,
            job,
            "info",
            f"Calibração de alta cobertura: {met_count}/5 ações principais atingiram a meta",
            22.0 if use_loov else 82.0,
        )

    if use_loov:
        oof_truth = [y_true]
        oof_probability = [y_probability]
        _log_progress(
            db,
            job,
            "info",
            f"Validação leave-one-video-out em {len(development_ids)} vídeos",
            25.0,
        )
        for fold_index, validation_id in enumerate(
            development_ids[1:],
            start=2,
        ):
            fold = build_unified_training_arrays(
                db,
                development_ids,
                target_fps=target_fps,
                window_ms=window_ms,
                validation_video_ids=[validation_id],
            )
            fold_model, _ = train_unified_model(
                fold.X_train,
                fold.y_train,
                fold.sample_weight_train,
                fold.X_val,
                fold.y_val,
                fold.sample_weight_val,
                config,
            )
            fold_prediction = fold_model.predict(fold.X_val, verbose=0)
            oof_truth.append(
                np.concatenate(
                    (
                        fold.y_val["actions"],
                        fold.y_val["observable_movements"],
                    ),
                    axis=1,
                )
            )
            oof_probability.append(
                np.concatenate(
                    (
                        fold_prediction["actions"],
                        fold_prediction["observable_movements"],
                    ),
                    axis=1,
                )
            )
            _log_progress(
                db,
                job,
                "info",
                f"Fold {fold_index}/{len(development_ids)} concluído",
                25.0 + 45.0 * fold_index / len(development_ids),
            )
            del fold_model

        postprocessing, metrics_by_label = calibrate_high_recall_thresholds(
            np.concatenate(oof_truth, axis=0),
            np.concatenate(oof_probability, axis=0),
            UNIFIED_LABELS,
            target_recall=float(config.get("target_recall", 0.90)),
        )
        loov_met_count = sum(
            bool(item["target_recall_met"])
            for label, item in metrics_by_label.items()
            if label in UNIFIED_ACTIONS[:5]
        )
        _log_progress(
            db,
            job,
            "info",
            f"Calibração LOOV: {loov_met_count}/5 ações principais atingiram a meta",
            75.0,
        )
        arrays = build_unified_training_arrays(
            db,
            development_ids,
            target_fps=target_fps,
            window_ms=window_ms,
            validation_video_ids=[],
        )
        model, _ = train_unified_model(
            arrays.X_train,
            arrays.y_train,
            arrays.sample_weight_train,
            arrays.X_val,
            arrays.y_val,
            arrays.sample_weight_val,
            config,
        )
        _log_progress(
            db,
            job,
            "info",
            "Modelo final retreinado com todos os vídeos de desenvolvimento",
            82.0,
        )

    fd, tmp_path = tempfile.mkstemp(suffix=".keras")
    os.close(fd)
    try:
        model.save(tmp_path)
        with open(tmp_path, "rb") as artifact_file:
            artifact_bytes = artifact_file.read()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    object_key = f"models/{model_id}/{version}/{MULTI_ACTION_CODE}.keras"
    storage_service.upload_bytes(
        object_key, artifact_bytes, "application/octet-stream"
    )
    artifact_uri = f"s3://{storage_service.bucket_name}/{object_key}"
    manifest = ModelManifest(
        model_id=model_id,
        version=version,
        action=MULTI_ACTION_CODE,
        architecture="cast-unified-v7",
        task_type="multitask_multilabel",
        feature_names=arrays.feature_names,
        feature_count=len(arrays.feature_names),
        sequence_length=arrays.X_train.shape[1],
        threshold=0.45,
        target_fps=target_fps,
        window_ms=window_ms,
        labels=list(UNIFIED_ACTIONS),
        output_heads=unified_output_heads(),
        calibration=postprocessing,
        calibration_version=f"{version}-calibration-v1",
        postprocessing=postprocessing,
        feature_schema_version="cast-unified-v7",
        metrics_by_label=metrics_by_label,
        training_config=TrainingConfig(
            epochs=int(config.get("epochs", 40)),
            batch_size=int(config.get("batch_size", 34)),
            learning_rate=float(config.get("learning_rate", 1e-4)),
            optimizer=str(config.get("optimizer", "adam")),
            early_stopping_patience=int(
                config.get("early_stopping_patience", 5)
            ),
            label_policy="center_frame_multilabel",
            seed=int(config.get("seed", 42)),
        ),
        artifact_uri=artifact_uri,
    )
    model_version = register_model_version(
        db=db,
        model_id=model_id,
        version=version,
        action=MULTI_ACTION_CODE,
        manifest=manifest,
        artifact_uri=artifact_uri,
        notes=(
            "CAST Unified V7 pilot; observable movements only. "
            f"train_videos={arrays.train_video_ids}; val_videos={arrays.val_video_ids}"
        ),
    )
    job.status = JobStatus.succeeded
    job.progress = 100.0
    job.finished_at = datetime.utcnow()
    job.result = {
        "model_version_id": str(model_version.id),
        "status": model_version.status,
        "action": MULTI_ACTION_CODE,
        "metrics_by_label": metrics_by_label,
    }
    _log_progress(
        db,
        job,
        "info",
        f"Modelo V7 registrado como draft ({model_version.id})",
        100.0,
    )
    return {"model_version_id": str(model_version.id)}


def _train_multimodal(
    db,
    job: ProcessingJob,
    *,
    model_id: str,
    version: str,
    video_ids: Optional[list[UUID]],
    config: dict[str, Any],
) -> dict:
    """Train and register the optional-EEG CAST V8 artifact."""
    from cast.features.multimodal import (
        EEG_FEATURE_SCHEMA_VERSION,
        MULTIMODAL_SCHEMA_VERSION,
    )
    from cast.features.unified import HEAD_MOTION_SCHEMA_VERSION
    from cast.models.manifest import ModelManifest, TrainingConfig
    from cast.models.multimodal_training import train_multimodal_model
    from cast.models.unified_classifier import unified_output_heads
    from cast.models.unified_training import (
        UNIFIED_LABELS,
        calibrate_high_recall_thresholds,
    )

    target_fps = float(config.get("target_fps", 30.0))
    head_window_ms = float(config.get("window_ms", 1000.0))
    eeg_window_ms = float(config.get("eeg_window_ms", 8000.0))
    dropout_probability = float(config.get("modality_dropout_probability", 0.25))
    min_eeg_valid_ratio = float(config.get("min_eeg_valid_ratio", 0.70))
    _log_progress(
        db,
        job,
        "info",
        "Montando janelas de cabeÃ§a e EEG com sincronizaÃ§Ã£o aprovada",
        10.0,
    )
    arrays = build_multimodal_training_arrays(
        db,
        video_ids,
        target_fps=target_fps,
        head_window_ms=head_window_ms,
        eeg_window_ms=eeg_window_ms,
        eeg_dropout_probability=dropout_probability,
        seed=int(config.get("seed", 42)),
        min_eeg_sessions=int(config.get("min_eeg_sessions", 2)),
        min_eeg_valid_ratio=min_eeg_valid_ratio,
    )
    _log_progress(
        db,
        job,
        "info",
        (
            f"Dados V8: {arrays.head_train.shape[0]} janelas, "
            f"{arrays.eeg_session_count} sessÃµes com EEG aprovado"
        ),
        25.0,
    )
    model, _ = train_multimodal_model(
        arrays.train_inputs(),
        arrays.y_train,
        arrays.sample_weight_train,
        arrays.val_inputs(),
        arrays.y_val,
        arrays.sample_weight_val,
        config,
    )
    _log_progress(db, job, "info", "Modelo multimodal V8 treinado", 70.0)

    postprocessing = default_postprocessing()
    metrics_by_label: dict[str, dict[str, float]] = {}
    if len(arrays.head_val):
        prediction = model.predict(arrays.val_inputs(), verbose=0)
        y_true = np.concatenate(
            (
                arrays.y_val["actions"],
                arrays.y_val["observable_movements"],
            ),
            axis=1,
        )
        y_probability = np.concatenate(
            (
                prediction["actions"],
                prediction["observable_movements"],
            ),
            axis=1,
        )
        postprocessing, metrics_by_label = calibrate_high_recall_thresholds(
            y_true,
            y_probability,
            UNIFIED_LABELS,
            target_recall=float(config.get("target_recall", 0.90)),
        )

    fd, tmp_path = tempfile.mkstemp(suffix=".keras")
    os.close(fd)
    try:
        model.save(tmp_path)
        with open(tmp_path, "rb") as artifact_file:
            artifact_bytes = artifact_file.read()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    object_key = f"models/{model_id}/{version}/{MULTI_ACTION_CODE}.keras"
    storage_service.upload_bytes(
        object_key,
        artifact_bytes,
        "application/octet-stream",
    )
    artifact_uri = f"s3://{storage_service.bucket_name}/{object_key}"
    manifest = ModelManifest(
        model_id=model_id,
        version=version,
        action=MULTI_ACTION_CODE,
        architecture="cast-multimodal-v8",
        task_type="multitask_multilabel",
        feature_names=arrays.head_feature_names,
        feature_count=len(arrays.head_feature_names),
        sequence_length=arrays.head_train.shape[1],
        threshold=0.45,
        target_fps=target_fps,
        window_ms=head_window_ms,
        labels=list(UNIFIED_ACTIONS),
        output_heads=unified_output_heads(),
        calibration=postprocessing,
        postprocessing=postprocessing,
        feature_schema_version=MULTIMODAL_SCHEMA_VERSION,
        metrics_by_label=metrics_by_label,
        required_modalities=["head_video"],
        optional_modalities=["eeg"],
        modality_feature_names={
            "head_video": arrays.head_feature_names,
            "eeg": arrays.eeg_feature_names,
        },
        feature_schema_versions={
            "head_video": HEAD_MOTION_SCHEMA_VERSION,
            "eeg": EEG_FEATURE_SCHEMA_VERSION,
        },
        missing_modality_policy="masked_optional",
        modality_dropout_probability=dropout_probability,
        sync_requirements={
            "approved_mapping_required": True,
            "mapping_version": "affine-v1",
            "eeg_window_ms": eeg_window_ms,
            "min_eeg_valid_ratio": min_eeg_valid_ratio,
        },
        validation_summary={
            "eeg_session_count": arrays.eeg_session_count,
            "validation_total_windows": int(len(arrays.head_val)),
            "eeg_validation_windows": int(
                np.sum(arrays.eeg_present_val[:, 0] > 0)
            )
            if len(arrays.eeg_present_val)
            else 0,
            "approved_sync_required": True,
            "participant_disjoint_split": True,
        },
        training_config=TrainingConfig(
            epochs=int(config.get("epochs", 40)),
            batch_size=int(config.get("batch_size", 34)),
            learning_rate=float(config.get("learning_rate", 1e-4)),
            optimizer=str(config.get("optimizer", "adam")),
            early_stopping_patience=int(
                config.get("early_stopping_patience", 5)
            ),
            label_policy="center_frame_multilabel",
            seed=int(config.get("seed", 42)),
        ),
        artifact_uri=artifact_uri,
    )
    model_version = register_model_version(
        db=db,
        model_id=model_id,
        version=version,
        action=MULTI_ACTION_CODE,
        manifest=manifest,
        artifact_uri=artifact_uri,
        notes=(
            "CAST Multimodal V8; EEG optional at inference and required for "
            f"multimodal validation. eeg_sessions={arrays.eeg_session_count}; "
            f"train_videos={arrays.train_video_ids}; val_videos={arrays.val_video_ids}"
        ),
    )
    job.status = JobStatus.succeeded
    job.progress = 100.0
    job.finished_at = datetime.utcnow()
    job.result = {
        "model_version_id": str(model_version.id),
        "status": model_version.status,
        "action": MULTI_ACTION_CODE,
        "architecture": "cast-multimodal-v8",
        "metrics_by_label": metrics_by_label,
    }
    _log_progress(
        db,
        job,
        "info",
        f"Modelo multimodal V8 registrado como draft ({model_version.id})",
        100.0,
    )
    return {"model_version_id": str(model_version.id)}


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
        config = {**TRAINING_CONFIG, **(training_config or {})}
        if action == MULTI_ACTION_CODE:
            if bool(config.get("multimodal")):
                return _train_multimodal(
                    db,
                    job,
                    model_id=model_id,
                    version=version,
                    video_ids=video_ids,
                    config=config,
                )
            return _train_unified(
                db,
                job,
                model_id=model_id,
                version=version,
                video_ids=video_ids,
                config=config,
            )
        X_train, y_train, X_val, y_val, feature_names = build_training_arrays(
            db, action, video_ids, sequence_length=SEQUENCE_LENGTH,
        )
        _log_progress(
            db, job, "info",
            f"Dados montados: {X_train.shape[0]} janelas de treino, {X_val.shape[0]} de validação",
            25.0,
        )

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
