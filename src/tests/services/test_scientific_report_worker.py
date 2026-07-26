from app.db.models import (
    AnalysisReport,
    ConsentStatus,
    JobStatus,
    JobType,
    Participant,
    ProcessingJob,
    Session,
)
from app.workers.tasks_reports import run_scientific_report_job
from tests.conftest import TestingSessionLocal
from tests.utils import create_random_project, create_random_study


def _report_job(db, normal_user, *, status=JobStatus.queued):
    project = create_random_project(db, normal_user.organization_id)
    study = create_random_study(db, project.id)
    participant = Participant(
        study_id=study.id,
        external_code="P-WORKER",
        consent_status=ConsentStatus.accepted,
    )
    db.add(participant)
    db.flush()
    db.add(
        Session(
            participant_id=participant.id,
            duration_seconds=240,
            condition="baseline",
        )
    )
    job = ProcessingJob(
        study_id=study.id,
        job_type=JobType.report,
        status=status,
        progress=0,
        logs=[],
        result={
            "generated_by": str(normal_user.id),
            "request": {
                "template_key": "study_overview",
                "outcome_ids": ["session.duration_seconds"],
                "seed": 19,
            },
        },
    )
    db.add(job)
    db.commit()
    return job


def test_report_worker_persists_pdf_json_snapshot_and_progress(
    db, normal_user, monkeypatch
):
    job = _report_job(db, normal_user)
    artifacts = {}

    monkeypatch.setattr("app.workers.tasks_reports.SessionLocal", TestingSessionLocal)

    def upload(key, data, content_type):
        artifacts[key] = (data, content_type)
        return True

    monkeypatch.setattr(
        "app.workers.tasks_reports.storage_service.upload_bytes", upload
    )
    result = run_scientific_report_job(str(job.id))

    db.expire_all()
    persisted = db.query(ProcessingJob).filter(ProcessingJob.id == job.id).one()
    report = db.query(AnalysisReport).filter(AnalysisReport.study_id == job.study_id).one()
    assert persisted.status == JobStatus.succeeded
    assert persisted.progress == 100
    assert result["report_id"] == str(report.id)
    assert len(report.data_snapshot_hash) == 64
    assert set(report.artifact_manifest) == {"pdf", "json"}
    assert any(value[1] == "application/pdf" for value in artifacts.values())
    assert any(value[1] == "application/json" for value in artifacts.values())


def test_report_worker_keeps_pre_canceled_job_canceled(db, normal_user, monkeypatch):
    job = _report_job(db, normal_user, status=JobStatus.canceled)
    monkeypatch.setattr("app.workers.tasks_reports.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(
        "app.workers.tasks_reports.storage_service.upload_bytes",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("Canceled job must not upload")
        ),
    )

    result = run_scientific_report_job(str(job.id))

    assert result["status"] == "canceled"
    db.expire_all()
    assert db.get(ProcessingJob, job.id).status == JobStatus.canceled


def test_report_worker_marks_storage_failure(db, normal_user, monkeypatch):
    job = _report_job(db, normal_user)
    monkeypatch.setattr("app.workers.tasks_reports.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(
        "app.workers.tasks_reports.storage_service.upload_bytes",
        lambda *args, **kwargs: False,
    )

    try:
        run_scientific_report_job(str(job.id))
    except RuntimeError as exc:
        assert "upload failed" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Storage failure did not fail the job")

    db.expire_all()
    persisted = db.get(ProcessingJob, job.id)
    assert persisted.status == JobStatus.failed
    assert "upload failed" in persisted.error_message
