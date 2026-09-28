from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Literal
from pydantic import BaseModel, Field

from app.db.models import (
    ApiRequestLog, AuditAction, AuditLog, ConsentTerm, Participant, Project, Study, User,
)
from app.api.deps import get_db, get_current_user, require_admin

router = APIRouter(prefix="/audit", tags=["audit"])

class AuditLogResponse(BaseModel):
    id: UUID
    participant_id: UUID
    participant_code: str
    study_id: UUID
    version: str
    accepted_at: str
    revoked_at: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None


class ChangeHistoryResponse(BaseModel):
    id: UUID
    action: str
    actor_id: UUID | None = None
    actor_label: str | None = None
    entity_type: str
    entity_id: str
    justification: str | None = None
    detail: dict = Field(default_factory=dict)
    created_at: str


@router.get("/history", response_model=List[ChangeHistoryResponse])
def get_change_history(
    entity_type: str | None = None,
    entity_id: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AuditLog).filter(AuditLog.organization_id == current_user.organization_id)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    logs = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    return [
        ChangeHistoryResponse(
            id=log.id,
            action=log.action.value,
            actor_id=log.actor_id,
            actor_label=log.actor_label,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            justification=log.justification,
            detail=log.detail or {},
            created_at=log.created_at.isoformat(),
        )
        for log in logs
    ]

@router.get("/consents", response_model=List[AuditLogResponse])
def get_consent_audit_logs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = (
        db.query(ConsentTerm, Participant.external_code, Participant.study_id)
        .join(Participant, ConsentTerm.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == current_user.organization_id)
        .order_by(ConsentTerm.accepted_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return [
        AuditLogResponse(
            id=log.ConsentTerm.id,
            participant_id=log.ConsentTerm.participant_id,
            participant_code=log.external_code,
            study_id=log.study_id,
            version=log.ConsentTerm.version,
            accepted_at=log.ConsentTerm.accepted_at.isoformat() if log.ConsentTerm.accepted_at else "",
            revoked_at=log.ConsentTerm.revoked_at.isoformat() if log.ConsentTerm.revoked_at else None,
            ip_address=log.ConsentTerm.ip_address,
            user_agent=log.ConsentTerm.user_agent
        ) for log in logs
    ]


class AuditLogPage(BaseModel):
    items: List[ChangeHistoryResponse]
    total: int


def _history_response(log: AuditLog) -> ChangeHistoryResponse:
    return ChangeHistoryResponse(
        id=log.id,
        action=log.action.value,
        actor_id=log.actor_id,
        actor_label=log.actor_label,
        entity_type=log.entity_type,
        entity_id=log.entity_id,
        justification=log.justification,
        detail=log.detail or {},
        created_at=log.created_at.isoformat(),
    )


@router.get("/logs", response_model=AuditLogPage)
def list_audit_logs(
    action: AuditAction | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    actor_id: UUID | None = None,
    q: str | None = Query(None, max_length=200),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Organization-wide audit trail with filters (admins only)."""
    query = db.query(AuditLog).filter(AuditLog.organization_id == current_user.organization_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    if actor_id:
        query = query.filter(AuditLog.actor_id == actor_id)
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)
    if q:
        pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                AuditLog.entity_id.ilike(pattern),
                AuditLog.actor_label.ilike(pattern),
                AuditLog.justification.ilike(pattern),
            )
        )
    total = query.count()
    logs = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    return AuditLogPage(items=[_history_response(log) for log in logs], total=total)


class RequestLogResponse(BaseModel):
    id: UUID
    actor_id: UUID | None = None
    actor_label: str | None = None
    method: str
    path: str
    route: str | None = None
    status_code: int
    duration_ms: int
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: str


class RequestLogPage(BaseModel):
    items: List[RequestLogResponse]
    total: int


StatusClass = Literal["success", "client_error", "server_error", "denied", "rate_limited"]


@router.get("/requests", response_model=RequestLogPage)
def list_request_logs(
    method: str | None = Query(None, max_length=10),
    status_class: StatusClass | None = None,
    actor_id: UUID | None = None,
    q: str | None = Query(None, max_length=200),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """API activity of the organization's users: writes and denied calls."""
    query = db.query(ApiRequestLog).filter(
        ApiRequestLog.organization_id == current_user.organization_id
    )
    if method:
        query = query.filter(ApiRequestLog.method == method.upper())
    if status_class == "success":
        query = query.filter(ApiRequestLog.status_code < 400)
    elif status_class == "client_error":
        query = query.filter(ApiRequestLog.status_code.between(400, 499))
    elif status_class == "server_error":
        query = query.filter(ApiRequestLog.status_code >= 500)
    elif status_class == "denied":
        query = query.filter(ApiRequestLog.status_code.in_((401, 403)))
    elif status_class == "rate_limited":
        query = query.filter(ApiRequestLog.status_code == 429)
    if actor_id:
        query = query.filter(ApiRequestLog.actor_id == actor_id)
    if date_from:
        query = query.filter(ApiRequestLog.created_at >= date_from)
    if date_to:
        query = query.filter(ApiRequestLog.created_at <= date_to)
    if q:
        pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                ApiRequestLog.path.ilike(pattern),
                ApiRequestLog.actor_label.ilike(pattern),
                ApiRequestLog.ip_address.ilike(pattern),
            )
        )
    total = query.count()
    rows = query.order_by(ApiRequestLog.created_at.desc()).offset(skip).limit(limit).all()
    return RequestLogPage(
        items=[
            RequestLogResponse(
                id=row.id,
                actor_id=row.actor_id,
                actor_label=row.actor_label,
                method=row.method,
                path=row.path,
                route=row.route,
                status_code=row.status_code,
                duration_ms=row.duration_ms,
                ip_address=row.ip_address,
                user_agent=row.user_agent,
                created_at=row.created_at.isoformat(),
            )
            for row in rows
        ],
        total=total,
    )


class AuditSummary(BaseModel):
    window_hours: int
    audit_events: int
    deletions: int
    failed_logins: int
    writes: int
    denied: int
    rate_limited: int
    server_errors: int


@router.get("/summary", response_model=AuditSummary)
def get_audit_summary(
    window_hours: int = Query(24, ge=1, le=24 * 90),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    since = datetime.utcnow() - timedelta(hours=window_hours)
    org_id = current_user.organization_id
    audit_counts = dict(
        db.query(AuditLog.action, func.count(AuditLog.id))
        .filter(AuditLog.organization_id == org_id, AuditLog.created_at >= since)
        .group_by(AuditLog.action)
        .all()
    )
    requests = db.query(ApiRequestLog).filter(
        ApiRequestLog.organization_id == org_id, ApiRequestLog.created_at >= since
    )
    return AuditSummary(
        window_hours=window_hours,
        audit_events=sum(audit_counts.values()),
        deletions=audit_counts.get(AuditAction.delete, 0),
        failed_logins=audit_counts.get(AuditAction.login_failed, 0),
        writes=requests.filter(ApiRequestLog.method.in_(("POST", "PUT", "PATCH", "DELETE"))).count(),
        denied=requests.filter(ApiRequestLog.status_code.in_((401, 403))).count(),
        rate_limited=requests.filter(ApiRequestLog.status_code == 429).count(),
        server_errors=requests.filter(ApiRequestLog.status_code >= 500).count(),
    )
