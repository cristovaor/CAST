from app.core.config import settings
from tests.utils import create_random_project, create_random_study, create_random_video


def test_resolve_session_short_reference(
    client,
    normal_user_token_headers,
    normal_user,
    db,
):
    project = create_random_project(db, org_id=normal_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    video = create_random_video(db, study_id=study.id)
    session = video.session

    response = client.get(
        f"{settings.API_V1_STR}/sessions/resolve",
        params={"ref": str(session.id).replace("-", "")[:8]},
        headers=normal_user_token_headers,
    )

    assert response.status_code == 200
    assert response.json()["id"] == str(session.id)
    assert response.json()["video_asset_id"] == str(video.id)


def test_resolve_session_rejects_invalid_reference(
    client,
    normal_user_token_headers,
):
    response = client.get(
        f"{settings.API_V1_STR}/sessions/resolve",
        params={"ref": "not-a-session"},
        headers=normal_user_token_headers,
    )

    assert response.status_code == 422


def test_resolve_session_does_not_disclose_other_organizations(
    client,
    normal_user_token_headers,
    db,
):
    from tests.utils import create_random_user

    foreign_user = create_random_user(db)
    project = create_random_project(db, org_id=foreign_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    session = create_random_video(db, study_id=study.id).session

    response = client.get(
        f"{settings.API_V1_STR}/sessions/resolve",
        params={"ref": str(session.id).replace("-", "")[:8]},
        headers=normal_user_token_headers,
    )

    assert response.status_code == 404
