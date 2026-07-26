import json

from app.core.config import settings
from app.db.models import Dataset, DatasetState


def _materialized_dataset(db, user):
    dataset = Dataset(
        organization_id=user.organization_id,
        name="Cohort A",
        dataset_version="1.0.0",
        level="analytic",
        state=DatasetState.validating,
        manifest={"schema": {"session_id": "str", "sync": "derived | null"}},
        participant_count=1,
        session_count=1,
        checksum="sha256:abc",
        storage_uri="s3://cast-videos/datasets/example/dataset.json",
        owner=user.name,
        build_status="built",
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


def _artifact_bytes():
    return json.dumps({
        "manifest": {"schema": {"session_id": "str", "sync": "derived | null"}},
        "records": [{
            "session_id": "session-1",
            "study_id": "study-1",
            "participant_code": "P-001",
            "condition": "baseline",
            "state": "synced",
            "video": {
                "id": "video-1",
                "filename": "video.mp4",
                "verdict": "approved",
                "landmarks": {
                    "artifact_id": "landmark-1",
                    "status": "ready",
                    "point_count": 478,
                    "face_detection_rate": 0.95,
                },
            },
            "eeg": {
                "id": "eeg-1",
                "filename": "eeg.csv",
                "valid_ratio": 0.9,
                "verdict": "approved",
            },
            "sync": {
                "state": "synced",
                "offset_ms": 120,
                "drift_ms_per_min": 1.5,
                "confidence": 0.8,
            },
        }],
        "excluded": [{"session_id": "session-2", "reason": "EEG ausente"}],
    }).encode("utf-8")


def test_inspect_materialized_dataset_records(
    client,
    db,
    normal_user,
    normal_user_token_headers,
    monkeypatch,
):
    from app.services.storage_service import storage_service

    dataset = _materialized_dataset(db, normal_user)
    monkeypatch.setattr(storage_service, "download_bytes", lambda _key: _artifact_bytes())

    response = client.get(
        f"{settings.API_V1_STR}/datasets/{dataset.id}/records",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["summary"]["sync"]["coverage_ratio"] == 1.0
    assert payload["summary"]["modality_coverage"]["landmarks_ready"] == 1
    assert payload["records"][0]["participant_code"] == "P-001"
    assert payload["excluded"][0]["reason"] == "EEG ausente"


def test_export_materialized_dataset_csv(
    client,
    db,
    normal_user,
    normal_user_token_headers,
    monkeypatch,
):
    from app.services.storage_service import storage_service

    dataset = _materialized_dataset(db, normal_user)
    monkeypatch.setattr(storage_service, "download_bytes", lambda _key: _artifact_bytes())

    response = client.get(
        f"{settings.API_V1_STR}/datasets/{dataset.id}/export",
        params={"format": "csv"},
        headers=normal_user_token_headers,
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "records.csv" in response.headers["content-disposition"]
    assert "session_id,study_id,participant_code" in response.text
    assert "P-001" in response.text
    assert "landmark-1" in response.text
