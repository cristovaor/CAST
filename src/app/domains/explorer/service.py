from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import (
    EEGAnalysisRun,
    EEGAsset,
    LandmarkArtifact,
    Session as SessionModel,
    VideoAsset,
)
from app.domains.explorer.schemas import ExplorerManifest
from app.schemas.time_series import ExplorerTrackDescriptor


def _duration_us(*seconds: object) -> int:
    for value in seconds:
        if value is not None:
            return max(0, round(float(value) * 1_000_000))
    return 0


def build_explorer_manifest(
    db: Session, session: SessionModel
) -> ExplorerManifest:
    """Aggregate descriptors only; sample payloads stay modality-owned."""
    video = db.query(VideoAsset).filter(VideoAsset.session_id == session.id).first()
    eeg = db.query(EEGAsset).filter(EEGAsset.session_id == session.id).first()
    landmark = None
    if video is not None:
        landmark = (
            db.query(LandmarkArtifact)
            .filter(
                LandmarkArtifact.video_asset_id == video.id,
                LandmarkArtifact.status == "ready",
            )
            .order_by(LandmarkArtifact.created_at.desc())
            .first()
        )
    eeg_run = None
    if eeg is not None:
        eeg_run = (
            db.query(EEGAnalysisRun)
            .filter(
                EEGAnalysisRun.eeg_asset_id == eeg.id,
                EEGAnalysisRun.status.in_(["succeeded", "partial"]),
            )
            .order_by(EEGAnalysisRun.created_at.desc())
            .first()
        )

    end_time_us = _duration_us(
        session.duration_seconds,
        video.duration_seconds if video else None,
        eeg.duration_seconds if eeg else None,
    )
    tracks: list[ExplorerTrackDescriptor] = []
    warnings: list[str] = []
    if video is not None:
        tracks.append(
            ExplorerTrackDescriptor(
                id=f"video:{video.id}",
                modality="video",
                label="Vídeo",
                kind="media",
                start_time_us=0,
                end_time_us=end_time_us,
                samples_url=f"/videos/{video.id}",
                quality_summary={
                    "verdict": getattr(video.quality_verdict, "value", video.quality_verdict),
                    "report": video.quality_report or {},
                },
                capabilities=["playback", "frame-reference"],
            )
        )
    if landmark is not None and video is not None:
        tracks.append(
            ExplorerTrackDescriptor(
                id=f"face-landmarks:{landmark.id}",
                modality="face",
                label="Landmarks faciais",
                kind="overlay",
                start_time_us=0,
                end_time_us=end_time_us,
                samples_url=(
                    f"/videos/{video.id}/landmarks?artifact_id={landmark.id}"
                    "&chunk={chunk}&mode={mode}"
                ),
                provenance_url=(
                    f"/videos/{video.id}/landmarks/download?artifact_id={landmark.id}"
                ),
                quality_summary={
                    "face_detection_rate": landmark.face_detection_rate,
                    "extractor": landmark.extractor,
                    "extractor_version": landmark.extractor_version,
                },
                capabilities=landmark.capabilities or ["mesh", "roi", "legacy-compatible"],
            )
        )
        if landmark.features_uri:
            tracks.append(
                ExplorerTrackDescriptor(
                    id=f"face-features:{landmark.id}",
                    modality="face",
                    label="Pose e blendshapes faciais",
                    kind="line",
                    start_time_us=0,
                    end_time_us=end_time_us,
                    samples_url=(
                        f"/videos/{video.id}/face-features?artifact_id={landmark.id}"
                        "&start_time_us={start_time_us}&end_time_us={end_time_us}&limit={limit}"
                    ),
                    quality_summary={
                        "extractor": landmark.extractor,
                        "model_checksum": landmark.model_checksum,
                    },
                    capabilities=landmark.capabilities or [],
                    experimental=True,
                )
            )
        if landmark.quality_uri:
            tracks.append(
                ExplorerTrackDescriptor(
                    id=f"face-quality:{landmark.id}",
                    modality="face-quality",
                    label="Qualidade facial por frame",
                    kind="quality",
                    start_time_us=0,
                    end_time_us=end_time_us,
                    samples_url=(
                        f"/videos/{video.id}/face-quality?artifact_id={landmark.id}"
                        "&start_time_us={start_time_us}&end_time_us={end_time_us}&limit={limit}"
                    ),
                    quality_summary={"face_detection_rate": landmark.face_detection_rate},
                    capabilities=["quality-flags", "range-query"],
                    experimental=True,
                )
            )
    if eeg_run is not None:
        tracks.append(
            ExplorerTrackDescriptor(
                id=f"eeg:{eeg_run.id}",
                modality="eeg",
                label="EEG",
                kind="line",
                start_time_us=0,
                end_time_us=end_time_us,
                samples_url=(
                    f"/eeg/analysis-runs/{eeg_run.id}/results/timeseries"
                    "?start_seconds={start_seconds}&end_seconds={end_seconds}"
                    "&limit={limit}"
                ),
                quality_summary={
                    "status": eeg_run.status,
                    "valid_ratio": eeg.valid_ratio if eeg else None,
                },
                capabilities=["range-query", "tiled", "downsampled"],
            )
        )
    elif eeg is not None:
        warnings.append("EEG disponível, mas ainda sem análise materializada")

    # Optional experiment domains remain independently owned. Explorer reads
    # only their stable catalog tables and never imports their implementations.
    try:
        gaze_rows = db.execute(text("""
            SELECT a.id, a.kind, a.layer, a.start_time_us, a.end_time_us, a.metrics, c.verdict
            FROM gaze_artifacts a JOIN gaze_calibrations c ON c.id = a.calibration_id
            WHERE c.session_id = :session_id AND c.status IN ('ready','no_go')
            ORDER BY a.created_at DESC
        """), {"session_id": session.id}).mappings().all()
        for row in gaze_rows:
            if row["kind"] == "calibrated_screen_gaze" and row["verdict"] == "no_go":
                continue
            tracks.append(ExplorerTrackDescriptor(
                id=f"gaze:{row['id']}", modality="gaze",
                label="Proxy de íris" if row["kind"] == "iris_offset_proxy" else "Gaze calibrado",
                kind="scatter", start_time_us=row["start_time_us"], end_time_us=row["end_time_us"],
                samples_url=f"/sessions/{session.id}/gaze-series/{row['id']}?start_time_us={{start_time_us}}&end_time_us={{end_time_us}}&limit={{limit}}",
                quality_summary=(row["metrics"] or {}) | {"verdict": row["verdict"], "layer": row["layer"]},
                capabilities=["range-query", "calibration-gated", "aoi-3x3"], experimental=True,
            ))
    except SQLAlchemyError:
        db.rollback()

    try:
        pupil_rows = db.execute(text("""
            SELECT a.id, a.kind, a.layer, a.start_time_us, a.end_time_us, a.metrics, r.verdict
            FROM pupil_artifacts a JOIN pupil_runs r ON r.id = a.run_id
            WHERE r.session_id = :session_id AND r.status IN ('ready','no_go')
            ORDER BY a.created_at DESC
        """), {"session_id": session.id}).mappings().all()
        labels = {"pupil_raw": "Pupila bruta", "pupil_normalized": "Pupila normalizada", "pupil_luminance_corrected": "Pupila corrigida por luminância"}
        for row in pupil_rows:
            tracks.append(ExplorerTrackDescriptor(
                id=f"pupil:{row['id']}", modality="pupil", label=labels.get(row["kind"], row["kind"]), kind="line",
                start_time_us=row["start_time_us"], end_time_us=row["end_time_us"],
                samples_url=f"/sessions/{session.id}/pupil-series/{row['id']}?start_time_us={{start_time_us}}&end_time_us={{end_time_us}}&limit={{limit}}",
                quality_summary=(row["metrics"] or {}) | {"verdict": row["verdict"], "layer": row["layer"]},
                capabilities=["range-query", "quality-flags", "luminance-aware"], experimental=True,
            ))
    except SQLAlchemyError:
        db.rollback()

    try:
        context_rows = db.execute(text("""
            SELECT id, kind, unit, method, start_time_us, end_time_us, sample_count, status
            FROM environment_artifacts WHERE session_id = :session_id AND status = 'ready'
            ORDER BY created_at DESC
        """), {"session_id": session.id}).mappings().all()
        for row in context_rows:
            tracks.append(ExplorerTrackDescriptor(
                id=f"context:{row['id']}", modality="context", label=row["kind"].replace("_", " ").title(), kind="line",
                start_time_us=row["start_time_us"], end_time_us=row["end_time_us"], unit=row["unit"],
                samples_url=f"/sessions/{session.id}/environment-series/{row['id']}?start_time_us={{start_time_us}}&end_time_us={{end_time_us}}&limit={{limit}}",
                quality_summary={"status": row["status"], "sample_count": row["sample_count"], "method": row["method"]},
                capabilities=["range-query", "environment", "provenance"],
            ))
        event_count = db.execute(text("SELECT count(*) FROM experimental_events WHERE session_id=:session_id"), {"session_id": session.id}).scalar() or 0
        if event_count:
            tracks.append(ExplorerTrackDescriptor(
                id=f"context-events:{session.id}", modality="context", label="Eventos experimentais", kind="markers",
                start_time_us=0, end_time_us=end_time_us,
                samples_url=f"/sessions/{session.id}/experimental-events?start_time_us={{start_time_us}}&end_time_us={{end_time_us}}&limit={{limit}}",
                quality_summary={"event_count": event_count}, capabilities=["range-query", "markers", "trials"],
            ))
    except SQLAlchemyError:
        db.rollback()

    return ExplorerManifest(
        session_id=session.id,
        end_time_us=end_time_us,
        tracks=tracks,
        warnings=warnings,
    )
