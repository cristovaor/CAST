from datetime import datetime, timedelta

import pytest

from app.core.config import settings
from app.db.models import LandmarkArtifact
from tests.utils import create_random_project, create_random_study, create_random_video


@pytest.mark.parametrize("new_status", ["processing", "failed", "ready"])
def test_context_keeps_latest_ready_overlay(client, db, normal_user, normal_user_token_headers, new_status):
    project = create_random_project(db, org_id=normal_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    video = create_random_video(db, study_id=study.id)
    older = LandmarkArtifact(
        video_asset_id=video.id, status="ready", extractor_version="legacy",
        video_checksum="a" * 64, config_hash="b" * 64, fps=30,
        overlay_prefix="landmarks/older/overlay", created_at=datetime.utcnow() - timedelta(hours=1),
    )
    newer = LandmarkArtifact(
        video_asset_id=video.id, status=new_status, extractor_version="v2",
        video_checksum="a" * 64, config_hash="c" * 64, fps=30,
        overlay_prefix="landmarks/newer/overlay" if new_status == "ready" else None,
        error_message="Missing GLES library" if new_status == "failed" else None,
    )
    db.add_all([older, newer])
    db.commit()
    response = client.get(f"{settings.API_V1_STR}/videos/{video.id}/annotation-context", headers=normal_user_token_headers)
    assert response.status_code == 200
    expected = newer if new_status == "ready" else older
    assert response.json()["landmarkArtifact"]["id"] == str(expected.id)
    assert response.json()["landmarkArtifact"]["status"] == "ready"
    assert newer.status == new_status  # Selecting the overlay does not alter the failed/running attempt.


def test_context_retains_failure_when_no_overlay_is_ready(client, db, normal_user, normal_user_token_headers):
    project = create_random_project(db, org_id=normal_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    video = create_random_video(db, study_id=study.id)
    artifact = LandmarkArtifact(
        video_asset_id=video.id, status="failed", extractor_version="v2",
        video_checksum="a" * 64, config_hash="b" * 64, fps=30,
        error_message="libGLESv2.so.2 missing",
    )
    db.add(artifact)
    db.commit()
    response = client.get(f"{settings.API_V1_STR}/videos/{video.id}/annotation-context", headers=normal_user_token_headers)
    assert response.status_code == 200
    assert response.json()["landmarkArtifact"]["status"] == "failed"
    assert response.json()["landmarkArtifact"]["errorMessage"] == "libGLESv2.so.2 missing"
