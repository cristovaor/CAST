from datetime import datetime, timedelta
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.core import security
from app.core.config import settings
from app.core.identity import IdentityVerificationError, get_identity_verifier
from app.db.models import User, Organization, UserIdentity
from app.schemas.auth import (
    AuthProviders,
    ForgotPassword,
    GoogleLogin,
    ResetPassword,
    Token,
    UserRegister,
)
from app.schemas.user import User as UserResponse
from app.services import invitations as invitation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_token(user: User) -> dict:
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(user.id, expires_delta=expires),
        "token_type": "bearer",
    }


@router.get("/providers", response_model=AuthProviders)
def auth_providers():
    """Advertise the enabled login methods so the UI can render accordingly."""
    return AuthProviders(password=True, google=settings.GOOGLE_LOGIN_ENABLED)


@router.post("/login", response_model=Token)
def login_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = db.query(User).filter(func.lower(User.email) == form_data.username.strip().casefold()).first()
    # A federated-only account has no password hash; verify_password must never
    # be called with None, and such an account cannot log in with a password.
    if not user or not user.password_hash or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    return _issue_token(user)


@router.post("/google", response_model=Token)
def login_with_google(payload: GoogleLogin, db: Session = Depends(get_db)):
    """Exchange a verified Firebase ID token for a CAST session token.

    Access is invite-only: proving control of a Google account is necessary but
    never sufficient. A user is created only when the verified e-mail matches a
    pending invitation (or the supplied invite token), and existing users are
    matched by provider subject first, then by e-mail for first-time linking.
    """
    if not settings.GOOGLE_LOGIN_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Google login is not enabled on this deployment.",
        )

    try:
        identity = get_identity_verifier().verify(payload.id_token)
    except IdentityVerificationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate Google credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Known federated identity → straight login.
    link = (
        db.query(UserIdentity)
        .filter(
            UserIdentity.provider == identity.provider,
            UserIdentity.subject == identity.subject,
        )
        .first()
    )
    if link is not None:
        user = db.query(User).filter(User.id == link.user_id).first()
        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been deactivated.",
            )
        link.last_login_at = datetime.utcnow()
        link.email = identity.email
        db.commit()
        return _issue_token(user)

    # 2. Existing local account with the same verified e-mail → link it.
    #    Safe because the provider asserted email_verified, so this cannot be
    #    used to hijack an address the caller does not control.
    user = db.query(User).filter(func.lower(User.email) == identity.email).first()

    invitation = None
    if user is None:
        # 3. New account: requires an invitation. Prefer the token from the
        #    invite link, fall back to a pending invite for this e-mail.
        if payload.invite_token:
            invitation = invitation_service.find_pending_by_token(db, payload.invite_token)
            # The invite must belong to the person who authenticated, otherwise
            # a leaked link would onboard whoever opened it.
            if invitation is not None and invitation.email != identity.email:
                invitation = None
        if invitation is None:
            invitation = invitation_service.find_pending_by_email(db, identity.email)

        if invitation is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Acesso restrito a convidados. Solicite um convite ao "
                    "administrador da plataforma."
                ),
            )

        user = User(
            email=identity.email,
            password_hash=None,
            name=invitation.name or identity.name or identity.email.split("@")[0],
            role=invitation.role,
            organization_id=invitation.organization_id,
        )
        db.add(user)
        db.flush()
        invitation_service.consume(db, invitation, user_id=user.id)
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    db.add(
        UserIdentity(
            user_id=user.id,
            provider=identity.provider,
            subject=identity.subject,
            email=identity.email,
            last_login_at=datetime.utcnow(),
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # Two concurrent first logins raced on the unique (provider, subject)
        # constraint. The other transaction won and the link now exists.
        db.rollback()
        link = (
            db.query(UserIdentity)
            .filter(
                UserIdentity.provider == identity.provider,
                UserIdentity.subject == identity.subject,
            )
            .first()
        )
        if link is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Could not complete sign-in. Please try again.",
            )
        user = db.query(User).filter(User.id == link.user_id).first()
        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been deactivated.",
            )

    return _issue_token(user)

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/register", response_model=UserResponse, status_code=201)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    """Create a password account by redeeming an invitation.

    Registration is invite-only: previously this endpoint let any caller create
    a user *and* an organization, which would have made the Google invite gate
    pointless — anyone refused at /auth/google could simply register here. The
    new account joins the inviting organization rather than creating one.
    """
    email = user_in.email.strip().casefold()

    invitation = None
    if user_in.invite_token:
        invitation = invitation_service.find_pending_by_token(db, user_in.invite_token)
        if invitation is not None and invitation.email != email:
            invitation = None
    if invitation is None:
        invitation = invitation_service.find_pending_by_email(db, email)

    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Acesso restrito a convidados. Solicite um convite ao "
                "administrador da plataforma."
            ),
        )

    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        email=email,
        password_hash=security.get_password_hash(user_in.password),
        name=user_in.name,
        role=invitation.role,
        organization_id=invitation.organization_id,
    )
    db.add(new_user)
    db.flush()
    invitation_service.consume(db, invitation, user_id=new_user.id)
    db.commit()
    db.refresh(new_user)

    return new_user

@router.post("/forgot-password")
def forgot_password(req: ForgotPassword, db: Session = Depends(get_db)):
    return {"status": "success", "message": "If the email is registered, a reset link was sent."}

@router.post("/reset-password")
def reset_password(req: ResetPassword, db: Session = Depends(get_db)):
    return {"status": "success", "message": "Password has been successfully reset."}

@router.post("/refresh", response_model=Token)
def refresh_token(current_user: User = Depends(get_current_user)):
    # Assuming valid token is required to refresh
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(current_user.id, expires_delta=access_token_expires),
        "token_type": "bearer",
    }

@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    # For JWT, logout is handled client side by removing the token.
    # Optionally, we could add token blacklisting here.
    return {"status": "success", "message": "Successfully logged out."}
