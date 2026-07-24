from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user, require_admin
from app.db.models import User, Organization
from app.schemas.settings import OrganizationSettings, PipelineSettingsUpdate, PipelineSettings

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("/organization", response_model=OrganizationSettings)
def get_organization_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    
    return OrganizationSettings(
        id=org.id if org else current_user.organization_id, # Fallback
        name=org.name if org else "Default Organization",
        plan=org.plan if org else "standard",
        max_storage_gb=org.max_storage_gb if org else 0,
        used_storage_gb=org.used_storage_gb if org else 0,
    )

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
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Organization not found")
    values = {
        "face_detection_threshold": 0.75,
        "blink_tolerance_frames": 5,
        "enable_head_pose_estimation": True,
        **(org.pipeline_settings or {}),
        **settings.model_dump(exclude_none=True),
    }
    org.pipeline_settings = values
    db.commit()
    return PipelineSettings(**values)
