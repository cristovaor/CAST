from fastapi.testclient import TestClient
from uuid import UUID

from app.core.config import settings
from app.db.models import AuditAction, AuditLog, ConsentTerm


def _create_study(client: TestClient, headers: dict) -> dict:
    project = client.post(
        f"{settings.API_V1_STR}/projects/",
        headers=headers,
        json={"name": "Academic enrollment project"},
    ).json()
    response = client.post(
        f"{settings.API_V1_STR}/studies/",
        headers=headers,
        json={
            "project_id": project["id"],
            "name": "Academic enrollment study",
        },
    )
    assert response.status_code == 200
    return response.json()


def test_create_participant_normalizes_code_and_records_consent(
    client: TestClient,
    db,
    normal_user_token_headers: dict,
) -> None:
    study = _create_study(client, normal_user_token_headers)

    response = client.post(
        f"{settings.API_V1_STR}/participants/",
        headers=normal_user_token_headers,
        json={
            "study_id": study["id"],
            "external_code": "  p-academic-01  ",
            "consent_status": "accepted",
            "consent_version": " TCLE 2.1 ",
            "demographic_group": {
                "cohort": "control",
                "age_range": "25-34",
                "enrollment": {
                    "eligibility_confirmed": True,
                    "direct_identifiers_excluded": True,
                },
            },
        },
    )

    assert response.status_code == 200
    participant = response.json()
    assert participant["external_code"] == "P-ACADEMIC-01"
    assert participant["consent_status"] == "accepted"

    consent = (
        db.query(ConsentTerm)
        .filter(ConsentTerm.participant_id == UUID(participant["id"]))
        .one()
    )
    assert consent.version == "TCLE 2.1"
    consent_audit = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "participant",
            AuditLog.entity_id == participant["id"],
            AuditLog.action == AuditAction.consent_change,
        )
        .one()
    )
    assert consent_audit.detail["version"] == "TCLE 2.1"
    assert consent_audit.detail["source"] == "enrollment"


def test_participant_code_must_be_unique_within_study(
    client: TestClient,
    normal_user_token_headers: dict,
) -> None:
    study = _create_study(client, normal_user_token_headers)
    first_response = client.post(
        f"{settings.API_V1_STR}/participants/",
        headers=normal_user_token_headers,
        json={
            "study_id": study["id"],
            "external_code": "P-DUPLICATE",
        },
    )
    assert first_response.status_code == 200

    response = client.post(
        f"{settings.API_V1_STR}/participants/",
        headers=normal_user_token_headers,
        json={
            "study_id": study["id"],
            "external_code": "p-duplicate",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Participant code already exists in this study"


def test_accepted_consent_requires_term_version(
    client: TestClient,
    normal_user_token_headers: dict,
) -> None:
    study = _create_study(client, normal_user_token_headers)

    response = client.post(
        f"{settings.API_V1_STR}/participants/",
        headers=normal_user_token_headers,
        json={
            "study_id": study["id"],
            "external_code": "P-NO-VERSION",
            "consent_status": "accepted",
        },
    )

    assert response.status_code == 422


def test_edit_participant_records_structured_profile_and_consent_change(
    client: TestClient,
    db,
    normal_user_token_headers: dict,
) -> None:
    study = _create_study(client, normal_user_token_headers)
    created = client.post(
        f"{settings.API_V1_STR}/participants/",
        headers=normal_user_token_headers,
        json={
            "study_id": study["id"],
            "external_code": "P-EDIT-01",
        },
    ).json()

    response = client.patch(
        f"{settings.API_V1_STR}/participants/{created['id']}",
        headers=normal_user_token_headers,
        json={
            "external_code": " p-edit-02 ",
            "demographic_group": {
                "cohort": "Intervention A",
                "age_range": "35-44",
                "education_level": "postgraduate",
            },
            "consent_status": "accepted",
            "consent_version": " TCLE 3.0 ",
        },
    )

    assert response.status_code == 200
    participant = response.json()
    assert participant["external_code"] == "P-EDIT-02"
    assert participant["demographic_group"]["education_level"] == "postgraduate"
    assert participant["consent_status"] == "accepted"

    consent = (
        db.query(ConsentTerm)
        .filter(ConsentTerm.participant_id == UUID(created["id"]))
        .one()
    )
    assert consent.version == "TCLE 3.0"
    audit = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "participant",
            AuditLog.entity_id == created["id"],
            AuditLog.action == AuditAction.consent_change,
        )
        .one()
    )
    assert audit.detail["source"] == "participant_edit"
    assert audit.detail["new_status"] == "accepted"


def test_deactivation_blocks_new_sessions_and_can_be_reversed(
    client: TestClient,
    db,
    normal_user_token_headers: dict,
) -> None:
    study = _create_study(client, normal_user_token_headers)
    participant = client.post(
        f"{settings.API_V1_STR}/participants/",
        headers=normal_user_token_headers,
        json={
            "study_id": study["id"],
            "external_code": "P-INACTIVE-01",
        },
    ).json()
    reason = "Participant completed every stage defined in the protocol."

    deactivated = client.post(
        f"{settings.API_V1_STR}/participants/{participant['id']}/deactivate",
        headers=normal_user_token_headers,
        json={"reason": reason},
    )

    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False
    assert deactivated.json()["deactivation_reason"] == reason
    assert deactivated.json()["deactivated_at"] is not None

    session_response = client.post(
        f"{settings.API_V1_STR}/sessions/",
        headers=normal_user_token_headers,
        json={"participant_id": participant["id"]},
    )
    assert session_response.status_code == 409

    audit = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "participant",
            AuditLog.entity_id == participant["id"],
            AuditLog.action == AuditAction.update,
            AuditLog.justification == reason,
        )
        .one()
    )
    assert audit.detail["changes"]["is_active"] == {"from": True, "to": False}

    reactivated = client.post(
        f"{settings.API_V1_STR}/participants/{participant['id']}/activate",
        headers=normal_user_token_headers,
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["is_active"] is True
    assert reactivated.json()["deactivation_reason"] is None
    assert reactivated.json()["deactivated_at"] is None
