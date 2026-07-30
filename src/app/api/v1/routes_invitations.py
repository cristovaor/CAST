"""Admin-facing invitation management.

Only organization admins may invite, and invitations are always scoped to the
admin's own organization — the organization is taken from the authenticated
user, never from the request body, so an admin cannot mint access to a tenant
they do not belong to.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.core.config import settings
from app.db.models import Invitation, User
from app.schemas.auth import InvitationCreate, InvitationCreated, InvitationRead
from app.services import invitations as invitation_service
from app.services.mailer import send_invitation_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invitations", tags=["invitations"])


def _to_read(invitation: Invitation) -> InvitationRead:
    return InvitationRead(
        id=invitation.id,
        email=invitation.email,
        role=invitation.role,
        name=invitation.name,
        status=invitation_service.status_of(invitation),
        expires_at=invitation.expires_at,
        created_at=invitation.created_at,
        consumed_at=invitation.consumed_at,
        invited_by=invitation.invited_by,
    )


@router.post("", response_model=InvitationCreated, status_code=status.HTTP_201_CREATED)
def create_invitation(
    payload: InvitationCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    email = invitation_service.normalize_email(payload.email)

    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe um usuário com este e-mail.",
        )

    existing = invitation_service.find_pending_by_email(db, email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe um convite pendente para este e-mail.",
        )

    invitation, token = invitation_service.create_invitation(
        db,
        email=email,
        organization_id=admin.organization_id,
        role=payload.role,
        invited_by=admin.id,
        name=payload.name,
        expires_hours=payload.expires_hours,
    )
    accept_url = invitation_service.build_accept_url(token)

    # Commit before sending: the invitation must survive an SMTP failure so the
    # admin can still hand over the link manually.
    db.commit()
    db.refresh(invitation)

    email_sent = False
    email_error: str | None = None
    if settings.EMAIL_ENABLED:
        expires_hours = max(
            1, int((invitation.expires_at - datetime.utcnow()).total_seconds() // 3600)
        )
        try:
            send_invitation_email(
                to=invitation.email,
                accept_url=accept_url,
                inviter_name=admin.name,
                expires_hours=expires_hours,
            )
            email_sent = True
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Invitation %s created but e-mail delivery failed: %s: %s",
                invitation.id,
                type(exc).__name__,
                exc,
            )
            email_error = "Não foi possível enviar o e-mail. Compartilhe o link manualmente."
    else:
        email_error = "Envio de e-mail não configurado. Compartilhe o link manualmente."

    return InvitationCreated(
        **_to_read(invitation).model_dump(),
        accept_url=accept_url,
        email_sent=email_sent,
        email_error=email_error,
    )


@router.get("", response_model=list[InvitationRead])
def list_invitations(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    status_filter: str | None = Query(
        default=None, alias="status", pattern="^(pending|consumed|revoked|expired)$"
    ),
):
    invitations = (
        db.query(Invitation)
        .filter(Invitation.organization_id == admin.organization_id)
        .order_by(Invitation.created_at.desc())
        .all()
    )
    result = [_to_read(invitation) for invitation in invitations]
    if status_filter:
        result = [item for item in result if item.status == status_filter]
    return result


@router.post("/{invitation_id}/resend", response_model=InvitationCreated)
def resend_invitation(
    invitation_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Rotate the token and re-send. The previous link stops working.

    The stored hash cannot be reversed, so "resend" necessarily issues a new
    token rather than re-mailing the original one.
    """
    invitation = (
        db.query(Invitation)
        .filter(
            Invitation.id == invitation_id,
            Invitation.organization_id == admin.organization_id,
        )
        .first()
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Convite não encontrado.")
    if invitation_service.status_of(invitation) in {"consumed", "revoked"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este convite já foi utilizado ou revogado.",
        )

    token = invitation_service.generate_token()
    invitation.token_hash = invitation_service.hash_token(token)
    invitation.expires_at = datetime.utcnow() + timedelta(
        hours=settings.INVITATION_EXPIRE_HOURS
    )
    accept_url = invitation_service.build_accept_url(token)
    db.commit()
    db.refresh(invitation)

    email_sent = False
    email_error: str | None = None
    if settings.EMAIL_ENABLED:
        try:
            send_invitation_email(
                to=invitation.email,
                accept_url=accept_url,
                inviter_name=admin.name,
                expires_hours=settings.INVITATION_EXPIRE_HOURS,
            )
            email_sent = True
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Invitation %s re-issued but e-mail delivery failed: %s: %s",
                invitation.id,
                type(exc).__name__,
                exc,
            )
            email_error = "Não foi possível enviar o e-mail. Compartilhe o link manualmente."
    else:
        email_error = "Envio de e-mail não configurado. Compartilhe o link manualmente."

    return InvitationCreated(
        **_to_read(invitation).model_dump(),
        accept_url=accept_url,
        email_sent=email_sent,
        email_error=email_error,
    )


@router.delete("/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invitation(
    invitation_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    invitation = (
        db.query(Invitation)
        .filter(
            Invitation.id == invitation_id,
            Invitation.organization_id == admin.organization_id,
        )
        .first()
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Convite não encontrado.")
    if invitation.consumed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Convites já utilizados não podem ser revogados.",
        )
    invitation_service.revoke(db, invitation)
    db.commit()
    return None
