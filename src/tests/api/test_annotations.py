from app.core.config import settings
from tests.utils import create_random_project, create_random_study, create_random_video


def test_video_annotation_crud_uses_frontend_contract(
    client,
    normal_user,
    normal_user_token_headers,
    db,
):
    project = create_random_project(db, org_id=normal_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    video = create_random_video(db, study_id=study.id)
    base_url = f"{settings.API_V1_STR}/videos/{video.id}/annotations"
    payload = {
        "kind": "interval",
        "actionCode": "OF",
        "actionLabel": "Olho fechado",
        "startTime": 1.2,
        "endTime": 1.8,
        "startFrame": 36,
        "endFrame": 54,
        "confidence": None,
        "notes": "manual",
    }

    created = client.post(
        base_url,
        headers=normal_user_token_headers,
        json=payload,
    )
    assert created.status_code == 201
    event = created.json()
    assert event["videoId"] == str(video.id)
    assert event["actionCode"] == "OF"
    assert event["microActionType"] == "OF"
    assert event["kind"] == "interval"
    assert event["source"] == "manual"
    assert event["annotatorId"] == str(normal_user.id)

    listed = client.get(base_url, headers=normal_user_token_headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [event["id"]]

    updated = client.put(
        f"{base_url}/{event['id']}",
        headers=normal_user_token_headers,
        json={
            "actionCode": "VR",
            "actionLabel": "Virou rosto",
            "endFrame": 60,
            "endTime": 2.0,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["actionCode"] == "VR"
    assert updated.json()["endTime"] == 2.0

    deleted = client.delete(
        f"{base_url}/{event['id']}",
        headers=normal_user_token_headers,
    )
    assert deleted.status_code == 204
    assert client.get(base_url, headers=normal_user_token_headers).json() == []


def test_point_annotation_requires_one_frame(
    client,
    normal_user,
    normal_user_token_headers,
    db,
):
    project = create_random_project(db, org_id=normal_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    video = create_random_video(db, study_id=study.id)
    base_url = f"{settings.API_V1_STR}/videos/{video.id}/annotations"

    invalid = client.post(
        base_url,
        headers=normal_user_token_headers,
        json={
            "kind": "point",
            "actionCode": "ML",
            "actionLabel": "Mexeu lábios",
            "startFrame": 10,
            "endFrame": 11,
        },
    )
    assert invalid.status_code == 422

    created = client.post(
        base_url,
        headers=normal_user_token_headers,
        json={
            "kind": "point",
            "actionCode": "ML",
            "actionLabel": "Mexeu lábios",
            "startFrame": 10,
            "endFrame": 10,
        },
    )
    assert created.status_code == 201
    assert created.json()["kind"] == "point"
    assert created.json()["startTime"] == created.json()["endTime"]


def test_annotation_time_must_match_frame_and_fps(
    client,
    normal_user,
    normal_user_token_headers,
    db,
):
    project = create_random_project(db, org_id=normal_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    video = create_random_video(db, study_id=study.id)
    response = client.post(
        f"{settings.API_V1_STR}/videos/{video.id}/annotations",
        headers=normal_user_token_headers,
        json={
            "kind": "interval",
            "actionCode": "OC",
            "startFrame": 30,
            "endFrame": 60,
            "startTime": 9.0,
            "endTime": 10.0,
        },
    )
    assert response.status_code == 422


def test_legacy_micro_action_type_alias_remains_compatible(
    client,
    normal_user,
    normal_user_token_headers,
    db,
):
    project = create_random_project(db, org_id=normal_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    video = create_random_video(db, study_id=study.id)
    response = client.post(
        f"{settings.API_V1_STR}/videos/{video.id}/annotations",
        headers=normal_user_token_headers,
        json={
            "microActionType": "OF",
            "startFrame": 0,
            "endFrame": 0,
        },
    )
    assert response.status_code == 201
    assert response.json()["actionCode"] == "OF"
    assert response.json()["microActionType"] == "OF"
