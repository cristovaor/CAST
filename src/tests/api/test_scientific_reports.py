from uuid import UUID

from app.db.models import ConsentStatus, Participant, ProcessingJob, Session
from tests.utils import create_random_project, create_random_study, create_random_user


def _study(db, user):
    project = create_random_project(db, user.organization_id)
    return create_random_study(db, project.id)


def test_templates_and_groups_enforce_scientific_eligibility(
    client, db, normal_user, normal_user_token_headers
):
    study = _study(db, normal_user)

    response = client.get(
        f"/api/v1/studies/{study.id}/reports/templates",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 200
    control_template = next(
        item
        for item in response.json()
        if item["key"] == "control_group_comparison"
    )
    assert control_template["eligible"] is False
    assert len(control_template["missing_requirements"]) >= 2

    first = client.post(
        f"/api/v1/studies/{study.id}/groups",
        headers=normal_user_token_headers,
        json={"code": "CTRL", "name": "Controle", "role": "control"},
    )
    second = client.post(
        f"/api/v1/studies/{study.id}/groups",
        headers=normal_user_token_headers,
        json={"code": "CTRL-2", "name": "Outro controle", "role": "control"},
    )
    assert first.status_code == 201
    assert second.status_code == 409


def test_preview_individual_has_no_population_test(
    client, db, normal_user, normal_user_token_headers
):
    study = _study(db, normal_user)
    participant = Participant(
        study_id=study.id,
        external_code="P-001",
        consent_status=ConsentStatus.accepted,
    )
    db.add(participant)
    db.flush()
    db.add(
        Session(
            participant_id=participant.id,
            condition="baseline",
            duration_seconds=300,
        )
    )
    db.commit()

    response = client.post(
        f"/api/v1/studies/{study.id}/reports/preview",
        headers=normal_user_token_headers,
        json={
            "template_key": "individual_longitudinal",
            "participant_id": str(participant.id),
            "outcome_ids": ["session.duration_seconds"],
        },
    )

    assert response.status_code == 200
    assert response.json()["analyses"] == []
    assert any("n=1" in item for item in response.json()["limitations"])


def test_generate_creates_report_job_bound_to_study(
    client, db, normal_user, normal_user_token_headers, monkeypatch
):
    study = _study(db, normal_user)
    participant = Participant(
        study_id=study.id,
        external_code="P-002",
        consent_status=ConsentStatus.accepted,
    )
    db.add(participant)
    db.flush()
    db.add(Session(participant_id=participant.id, duration_seconds=120))
    db.commit()
    dispatched = {}

    def fake_apply_async(*, args, task_id):
        dispatched["args"] = args
        dispatched["task_id"] = task_id

    monkeypatch.setattr(
        "app.api.v1.routes_reports.generate_scientific_report_task.apply_async",
        fake_apply_async,
    )
    response = client.post(
        f"/api/v1/studies/{study.id}/reports/generate",
        headers=normal_user_token_headers,
        json={
            "template_key": "study_overview",
            "outcome_ids": ["session.duration_seconds"],
            "seed": 11,
        },
    )

    assert response.status_code == 202
    job = db.query(ProcessingJob).filter(
        ProcessingJob.id == UUID(response.json()["job_id"])
    ).one()
    assert job.study_id == study.id
    assert job.job_type.value == "report"
    assert dispatched["task_id"] == str(job.id)


def test_reports_do_not_disclose_another_organization(
    client, db, normal_user, normal_user_token_headers
):
    other_user = create_random_user(db)
    study = _study(db, other_user)

    response = client.get(
        f"/api/v1/studies/{study.id}/reports/templates",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 404
