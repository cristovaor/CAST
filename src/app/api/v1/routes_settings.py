from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user, require_admin
from app.db.models import AuditAction, User, Organization
from app.schemas.settings import (
    OrganizationSettings,
    OrganizationSettingsUpdate,
    PipelineSettingsUpdate,
    PipelineSettings,
)
from app.services.audit_service import build_changes, record_audit

router = APIRouter(prefix="/settings", tags=["settings"])


def _organization_settings(org: Organization) -> OrganizationSettings:
    return OrganizationSettings(
        id=org.id,
        name=org.name,
        display_name=org.display_name,
        institution=org.institution,
        contact_email=org.contact_email,
        timezone=org.timezone or "America/Sao_Paulo",
        default_locale=org.default_locale or "pt-BR",
        plan=org.plan,
        max_storage_gb=org.max_storage_gb,
        used_storage_gb=org.used_storage_gb,
    )


@router.get("/organization", response_model=OrganizationSettings)
def get_organization_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if org is None:
        return OrganizationSettings(
            id=current_user.organization_id,
            name="Default Organization",
            plan="standard",
            max_storage_gb=0,
            used_storage_gb=0,
        )
    return _organization_settings(org)


@router.patch("/organization", response_model=OrganizationSettings)
def update_organization_settings(
    payload: OrganizationSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    update_data = payload.model_dump(exclude_unset=True)
    if update_data.get("name") is None:
        update_data.pop("name", None)  # the organization always keeps a name
    for field in ("timezone", "default_locale"):
        if update_data.get(field) is None:
            update_data.pop(field, None)  # non-nullable columns
    changes = build_changes(org, update_data)
    for field, value in update_data.items():
        setattr(org, field, value)
    if changes:
        record_audit(db, current_user, AuditAction.update, "organization", org.id, changes=changes)
    db.commit()
    db.refresh(org)
    return _organization_settings(org)


@router.get("/pipeline", response_model=PipelineSettings)
def get_pipeline_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    values = org.pipeline_settings or {} if org else {}
    return PipelineSettings(
        face_detection_threshold=values.get("face_detection_threshold", 0.75),
        blink_tolerance_frames=values.get("blink_tolerance_frames", 5),
        enable_head_pose_estimation=values.get("enable_head_pose_estimation", True),
    )

@router.patch("/pipeline", response_model=PipelineSettings)
def update_pipeline_settings(
    settings: PipelineSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    previous = {
        "face_detection_threshold": 0.75,
        "blink_tolerance_frames": 5,
        "enable_head_pose_estimation": True,
        **(org.pipeline_settings or {}),
    }
    values = {**previous, **settings.model_dump(exclude_none=True)}
    changes = {
        key: {"from": previous.get(key), "to": value}
        for key, value in values.items()
        if previous.get(key) != value
    }
    org.pipeline_settings = values
    if changes:
        record_audit(
            db, current_user, AuditAction.update, "pipeline_settings", org.id, changes=changes
        )
    db.commit()
    return PipelineSettings(**values)
