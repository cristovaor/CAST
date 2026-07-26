"""Dataset assembly service (docs §17).

Materializes a reproducible multimodal dataset from sessions selected by
inclusion/exclusion criteria. Keeps observed / derived data distinct in the
record schema and records full lineage (which sessions were included/excluded
and why) so the result is reproducible.

Criteria (all optional) — a session is INCLUDED only if it passes every check:
    study_ids:            restrict to these studies
    conditions:           restrict to these experimental conditions
    modalities:           required modalities, e.g. ["video", "eeg"]
    require_sync:         only sessions with an approved synchronization
    min_eeg_valid_ratio:  EEG quality gate (0..1)
    require_consent:      only participants with accepted consent
    states:               restrict to these session states
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session as OrmSession

from app.db.models import (
    Session as SessionModel, Participant, VideoAsset, EEGAsset, Synchronization,
    Study, Project, ConsentStatus, SyncState, LandmarkArtifact,
)

RECORD_SCHEMA = {
    "session_id": "str",
    "study_id": "str",
    "participant_code": "str (pseudonymized)",
    "condition": "str | null",
    "state": "str",
    "video": "{id, filename, verdict, landmarks} | null (observed)",
    "eeg": "{id, filename, channel_count, sample_rate_hz, valid_ratio, verdict} | null (observed)",
    "sync": "{state, offset_ms, drift_ms_per_min, confidence} | null (derived)",
}


def _passes(
    session: SessionModel,
    participant: Participant,
    study_id,
    video: Optional[VideoAsset],
    eeg: Optional[EEGAsset],
    sync: Optional[Synchronization],
    criteria: Dict[str, Any],
) -> Optional[str]:
    """Returns None if the session is included, else the exclusion reason."""
    study_ids = criteria.get("study_ids") or []
    if study_ids and str(study_id) not in [str(s) for s in study_ids]:
        return "estudo fora do escopo"

    conditions = criteria.get("conditions") or []
    if conditions and (session.condition or "") not in conditions:
        return f"condição '{session.condition}' fora do escopo"

    states = criteria.get("states") or []
    state_val = session.state.value if session.state else None
    if states and state_val not in states:
        return f"estado '{state_val}' não elegível"

    modalities = criteria.get("modalities") or []
    if "video" in modalities and not video:
        return "vídeo ausente"
    if "eeg" in modalities and not eeg:
        return "EEG ausente"

    if criteria.get("require_consent") and participant.consent_status != ConsentStatus.accepted:
        return "consentimento ausente ou revogado"

    if criteria.get("require_sync"):
        ok = sync and sync.state in (SyncState.synced, SyncState.synced_with_caveats)
        if not ok:
            return "sincronização não aprovada"

    min_vr = criteria.get("min_eeg_valid_ratio")
    if min_vr is not None and eeg is not None:
        if (eeg.valid_ratio or 0) < float(min_vr):
            return f"EEG válido {round((eeg.valid_ratio or 0)*100)}% < mínimo {round(float(min_vr)*100)}%"

    return None


def select_sessions(
    db: OrmSession,
    criteria: Dict[str, Any],
    organization_id=None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Apply criteria only inside the requested tenant.

    ``organization_id`` is mandatory for API and worker callers. It remains
    optional for backwards-compatible service tests that build an isolated
    in-memory database.
    """
    query = (
        db.query(SessionModel, Participant, Participant.study_id)
        .join(Participant, SessionModel.participant_id == Participant.id)
    )
    if organization_id is not None:
        query = (
            query
            .join(Study, Participant.study_id == Study.id)
            .join(Project, Study.project_id == Project.id)
            .filter(Project.organization_id == organization_id)
        )
    rows = query.all()

    included: List[Dict[str, Any]] = []
    excluded: List[Dict[str, Any]] = []

    for session, participant, study_id in rows:
        video = db.query(VideoAsset).filter(VideoAsset.session_id == session.id).first()
        eeg = db.query(EEGAsset).filter(EEGAsset.session_id == session.id).first()
        sync = db.query(Synchronization).filter(Synchronization.session_id == session.id).first()
        landmark = None
        if video is not None:
            landmark = (
                db.query(LandmarkArtifact)
                .filter(LandmarkArtifact.video_asset_id == video.id)
                .order_by(LandmarkArtifact.created_at.desc())
                .first()
            )

        reason = _passes(session, participant, study_id, video, eeg, sync, criteria)
        if reason:
            excluded.append({"session_id": str(session.id), "reason": reason})
            continue

        included.append({
            "session_id": str(session.id),
            "study_id": str(study_id),
            "participant_code": participant.external_code,  # pseudonymized
            "condition": session.condition,
            "state": session.state.value if session.state else None,
            "video": None if not video else {
                "id": str(video.id),
                "filename": video.filename,
                "verdict": video.quality_verdict.value if video.quality_verdict else None,
                "landmarks": None if not landmark else {
                    "artifact_id": str(landmark.id),
                    "status": landmark.status,
                    "extractor": landmark.extractor,
                    "extractor_version": landmark.extractor_version,
                    "frame_count": landmark.frame_count,
                    "point_count": landmark.point_count,
                    "face_detection_rate": landmark.face_detection_rate,
                    "chunk_size_frames": landmark.chunk_size_frames,
                    "normalized_checksum": landmark.normalized_checksum,
                },
            },
            "eeg": None if not eeg else {
                "id": str(eeg.id),
                "filename": eeg.filename,
                "channel_count": eeg.channel_count,
                "sample_rate_hz": eeg.sample_rate_hz,
                "valid_ratio": eeg.valid_ratio,
                "verdict": eeg.quality_verdict.value if eeg.quality_verdict else None,
            },
            "sync": None if not sync else {
                "state": sync.state.value if sync.state else None,
                "offset_ms": sync.offset_ms,
                "drift_ms_per_min": sync.drift_ms_per_min,
                "confidence": sync.confidence,
            },
        })

    return included, excluded


def summarize_records(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Return descriptive coverage statistics with explicit denominators."""
    from statistics import mean, median

    total = len(records)
    sync_states: Dict[str, int] = {}
    offsets: List[float] = []
    drifts: List[float] = []
    confidences: List[float] = []
    eeg_valid_ratios: List[float] = []
    with_video = with_eeg = with_landmarks = 0

    for record in records:
        video = record.get("video")
        eeg = record.get("eeg")
        sync = record.get("sync")
        if video:
            with_video += 1
            if (video.get("landmarks") or {}).get("status") == "ready":
                with_landmarks += 1
        if eeg:
            with_eeg += 1
            if eeg.get("valid_ratio") is not None:
                eeg_valid_ratios.append(float(eeg["valid_ratio"]))
        state = (sync or {}).get("state") or "not_synced"
        sync_states[state] = sync_states.get(state, 0) + 1
        if sync:
            if sync.get("offset_ms") is not None:
                offsets.append(float(sync["offset_ms"]))
            if sync.get("drift_ms_per_min") is not None:
                drifts.append(float(sync["drift_ms_per_min"]))
            if sync.get("confidence") is not None:
                confidences.append(float(sync["confidence"]))

    approved = sync_states.get("synced", 0) + sync_states.get("synced_with_caveats", 0)
    return {
        "record_count": total,
        "modality_coverage": {
            "video": with_video,
            "eeg": with_eeg,
            "multimodal": sum(1 for record in records if record.get("video") and record.get("eeg")),
            "landmarks_ready": with_landmarks,
        },
        "sync": {
            "states": sync_states,
            "approved": approved,
            "coverage_ratio": (approved / total) if total else 0.0,
            "offset_ms_mean": mean(offsets) if offsets else None,
            "offset_ms_median": median(offsets) if offsets else None,
            "offset_ms_range": [min(offsets), max(offsets)] if offsets else None,
            "drift_ms_per_min_mean": mean(drifts) if drifts else None,
            "confidence_mean": mean(confidences) if confidences else None,
            "confidence_n": len(confidences),
        },
        "eeg": {
            "valid_ratio_mean": mean(eeg_valid_ratios) if eeg_valid_ratios else None,
            "valid_ratio_range": (
                [min(eeg_valid_ratios), max(eeg_valid_ratios)]
                if eeg_valid_ratios else None
            ),
            "valid_ratio_n": len(eeg_valid_ratios),
        },
    }


def build_manifest(
    db: OrmSession,
    criteria: Dict[str, Any],
    included: List[Dict[str, Any]],
    excluded: List[Dict[str, Any]],
    dataset_version: str,
    level: str,
    owner: Optional[str],
) -> Dict[str, Any]:
    """Assembles the reproducible manifest (docs §17)."""
    import uuid as _uuid

    study_ids = sorted({r["study_id"] for r in included})
    study_names = []
    for sid in study_ids:
        # study_id in `included` records is a str (see select_sessions); coerce
        # back to UUID for the lookup so this also works against SQLite in tests,
        # whose UUID bind-parameter processor requires a uuid.UUID instance.
        try:
            lookup_id = _uuid.UUID(sid)
        except (ValueError, AttributeError):
            lookup_id = sid
        st = db.query(Study).filter(Study.id == lookup_id).first()
        study_names.append(st.name if st else sid)

    participants = sorted({r["participant_code"] for r in included})
    conditions = sorted({r["condition"] for r in included if r["condition"]})
    modalities = criteria.get("modalities") or ["video", "eeg"]

    inclusion, exclusion = [], []
    if criteria.get("require_sync"):
        inclusion.append("sincronização aprovada")
    if criteria.get("require_consent"):
        inclusion.append("consentimento ativo")
    if criteria.get("min_eeg_valid_ratio") is not None:
        inclusion.append(f"EEG válido ≥ {round(float(criteria['min_eeg_valid_ratio'])*100)}%")
    if conditions:
        inclusion.append(f"condições: {', '.join(conditions)}")
    excl_reasons = sorted({e["reason"] for e in excluded})
    exclusion.extend(excl_reasons)

    return {
        "dataset_version": dataset_version,
        "level": level,
        "sourceStudies": study_names,
        "participantCount": len(participants),
        "sessionCount": len(included),
        "conditions": conditions,
        "modalities": modalities,
        "inclusionCriteria": inclusion or ["sem filtros"],
        "exclusionCriteria": exclusion or ["nenhuma"],
        "transformations": ["seleção por critérios", "montagem multimodal sincronizada"],
        "pipelineVersions": ["dataset-build@1.0"],
        "modelVersions": [],
        "schema": RECORD_SCHEMA,
        "missingDataPolicy": "sessões incompletas excluídas conforme critérios",
        "owner": owner or "—",
    }
