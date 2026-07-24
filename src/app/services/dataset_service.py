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
    Study, ConsentStatus, SyncState,
)

RECORD_SCHEMA = {
    "session_id": "str",
    "study_id": "str",
    "participant_code": "str (pseudonymized)",
    "condition": "str | null",
    "state": "str",
    "video": "{filename, verdict} | null (observed)",
    "eeg": "{filename, channel_count, sample_rate_hz, valid_ratio, verdict} | null (observed)",
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


def select_sessions(db: OrmSession, criteria: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Applies criteria to all sessions. Returns (included_records, excluded)."""
    rows = (
        db.query(SessionModel, Participant, Participant.study_id)
        .join(Participant, SessionModel.participant_id == Participant.id)
        .all()
    )

    included: List[Dict[str, Any]] = []
    excluded: List[Dict[str, Any]] = []

    for session, participant, study_id in rows:
        video = db.query(VideoAsset).filter(VideoAsset.session_id == session.id).first()
        eeg = db.query(EEGAsset).filter(EEGAsset.session_id == session.id).first()
        sync = db.query(Synchronization).filter(Synchronization.session_id == session.id).first()

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
                "filename": video.filename,
                "verdict": video.quality_verdict.value if video.quality_verdict else None,
            },
            "eeg": None if not eeg else {
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
