from fastapi.testclient import TestClient
from app.core.config import settings
from tests.utils import create_random_video, create_random_study, create_random_project, create_random_user

def test_get_video_timeline(client: TestClient, normal_user_token_headers: dict, normal_user, db) -> None:
    # Setup some hierarchical data
    project = create_random_project(db, org_id=normal_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    video = create_random_video(db, study_id=study.id)

    r = client.get(f"{settings.API_V1_STR}/videos/{video.id}/timeline", headers=normal_user_token_headers)
    assert r.status_code == 200
    timeline = r.json()
    assert "events" in timeline
    assert isinstance(timeline["events"], list)

def test_init_upload(client: TestClient, normal_user_token_headers: dict, normal_user, db) -> None:
    # First, we need a session
    project = create_random_project(db, org_id=normal_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    
    from app.db.models import Participant
    participant = Participant(study_id=study.id, external_code="part_video_test")
    db.add(participant)
    db.commit()
    db.refresh(participant)

    r = client.post(
        f"{settings.API_V1_STR}/videos/init-upload", 
        headers=normal_user_token_headers, 
        params={
            "participant_id": str(participant.id),
            "filename": "new_upload.mp4",
            "mime_type": "video/mp4",
            "size_bytes": 1024
        }
    )
    assert r.status_code in (200, 201)
    video_data = r.json()
    assert "upload_url" in video_data
    assert "video_asset_id" in video_data
