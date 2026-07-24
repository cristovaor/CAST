"""Governance, ethics & privacy (docs §21).

Surfaces the sensitive-data audit trail (access, exports, consent changes,
sync/dataset decisions), a governance summary, and consent-revocation handling
that blocks further analysis on affected sessions.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional
from datetime import datetime

from app.api.deps import get_db
from app.db.models import (
    AuditLog, AuditAction, ConsentTerm, Participant, Session as SessionModel,
    ConsentStatus,
)
from app.schemas.multimodal import AuditLogEntry
from pydantic import BaseModel

router = APIRouter(prefix="/governance", tags=["governance"])


@router.get("/audit", response_model=List[AuditLogEntry])
def list_audit(
    action: Optional[AuditAction] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    return q.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()


class AuditCreate(BaseModel):
    action: AuditAction
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    actor_label: Optional[str] = None
    justification: Optional[str] = None
    detail: dict = {}


@router.post("/audit", response_model=AuditLogEntry, status_code=201)
def record_audit(payload: AuditCreate, db: Session = Depends(get_db)):
    """Records an access/action against sensitive data (justification advised)."""
    log = AuditLog(**payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


class GovernanceSummary(BaseModel):
    total_participants: int
    pending_consents: int
    revoked_consents: int
    active_consents: int
    recent_exports: int
    recent_accesses: int


@router.get("/summary", response_model=GovernanceSummary)
def governance_summary(db: Session = Depends(get_db)):
    total = db.query(Participant).count()
    pending = db.query(Participant).filter(Participant.consent_status == ConsentStatus.pending).count()
    revoked = db.query(Participant).filter(Participant.consent_status == ConsentStatus.revoked).count()
    active = db.query(Participant).filter(Participant.consent_status == ConsentStatus.accepted).count()
    exports = db.query(AuditLog).filter(AuditLog.action == AuditAction.export).count()
    accesses = db.query(AuditLog).filter(AuditLog.action == AuditAction.access).count()
    return GovernanceSummary(
        total_participants=total,
        pending_consents=pending,
        revoked_consents=revoked,
        active_consents=active,
        recent_exports=exports,
        recent_accesses=accesses,
    )


class RevokeConsent(BaseModel):
    justification: Optional[str] = None


@router.post("/participants/{participant_id}/revoke-consent")
def revoke_consent(participant_id: UUID, payload: RevokeConsent, db: Session = Depends(get_db)):
    """Revokes consent and flags the participant's data for restricted use."""
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.consent_status = ConsentStatus.revoked
    consent = (
        db.query(ConsentTerm)
        .filter(ConsentTerm.participant_id == participant_id, ConsentTerm.revoked_at.is_(None))
        .first()
    )
    if consent:
        consent.revoked_at = datetime.utcnow()

    db.add(AuditLog(
        action=AuditAction.consent_change,
        entity_type="participant",
        entity_id=str(participant_id),
        justification=payload.justification,
        detail={"new_status": "revoked"},
    ))
    db.commit()
    return {"participant_id": participant_id, "consent_status": "revoked"}


def assert_consent_valid(participant_id: UUID, db: Session):
    """Guard used by analysis endpoints: blocks work without valid consent."""
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant or participant.consent_status != ConsentStatus.accepted:
        raise HTTPException(
            status_code=403,
            detail="Análise bloqueada: consentimento ausente ou revogado para este participante.",
        )


def assert_consent_valid_for_video(video_id: UUID, db: Session):
    """Resolves video → session → participant and checks consent (docs §21)."""
    from app.db.models import VideoAsset, Session as SessionModel
    row = (
        db.query(Participant)
        .join(SessionModel, SessionModel.participant_id == Participant.id)
        .join(VideoAsset, VideoAsset.session_id == SessionModel.id)
        .filter(VideoAsset.id == video_id)
        .first()
    )
    if not row or row.consent_status != ConsentStatus.accepted:
        raise HTTPException(
            status_code=403,
            detail="Análise bloqueada: consentimento ausente ou revogado para este participante.",
        )


def record_access(db: Session, entity_type: str, entity_id, actor: str | None = None, detail: dict | None = None):
    """Best-effort audit of access to sensitive raw data (docs §21).

    Never breaks the request path: audit failures are swallowed so a logging
    issue cannot block a legitimate access.
    """
    try:
        db.add(AuditLog(
            action=AuditAction.access,
            entity_type=entity_type,
            entity_id=str(entity_id),
            actor_label=actor,
            detail=detail or {},
        ))
        db.commit()
    except Exception:
        db.rollback()
