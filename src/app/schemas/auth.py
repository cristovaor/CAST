from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.db.models import UserRole

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: str = None

class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    invite_token: Optional[str] = None

class ForgotPassword(BaseModel):
    email: str

class ResetPassword(BaseModel):
    token: str
    new_password: str


class GoogleLogin(BaseModel):
    """Firebase ID token obtained in the browser, plus an optional invite."""

    id_token: str = Field(min_length=1)
    # Present when the user arrived through an invitation link. Without it we
    # fall back to matching a pending invitation by the verified e-mail.
    invite_token: Optional[str] = None


class AuthProviders(BaseModel):
    """Which login methods this deployment offers (drives the login UI)."""

    password: bool
    google: bool


class InvitationCreate(BaseModel):
    email: EmailStr
    role: UserRole = UserRole.researcher
    name: Optional[str] = None
    expires_hours: Optional[int] = Field(default=None, ge=1, le=24 * 30)


class InvitationRead(BaseModel):
    id: UUID
    email: str
    role: UserRole
    name: Optional[str] = None
    status: str
    expires_at: datetime
    created_at: Optional[datetime] = None
    consumed_at: Optional[datetime] = None
    invited_by: Optional[UUID] = None

    model_config = {"from_attributes": True}


class InvitationCreated(InvitationRead):
    """Returned once, at creation: carries the only copy of the plaintext link."""

    accept_url: str
    email_sent: bool
    email_error: Optional[str] = None
