from behave import given, when, then
from app.db.models import ProcessingJob, JobType, JobStatus
from unittest.mock import patch
import uuid

@given('I have an existing processing job')
def step_impl(context):
    db = context.TestingSessionLocal()
    job = ProcessingJob(job_type=JobType.extract_landmarks, status=JobStatus.queued)
    db.add(job)
    db.commit()
    db.refresh(job)
    context.job_id = str(job.id)
    db.close()

@when('I request the status of the job')
def step_impl(context):
    context.response = context.client.get(
        f"/api/v1/jobs/{context.job_id}",
        headers=context.user_token_headers
    )

@then('the response should contain the job status "{status}"')
def step_impl(context, status):
    assert context.response.json()["status"] == status

@when('I request to cancel the job')
def step_impl(context):
    # Mock celery app to avoid actual revocation errors
    with patch('app.api.v1.routes_jobs.celery_app') as mock_celery:
        context.response = context.client.post(
            f"/api/v1/jobs/{context.job_id}/cancel",
            headers=context.user_token_headers
        )

@then('the response should confirm the cancellation')
def step_impl(context):
    assert "cancelled" in context.response.json()["message"].lower()

@when('I request an export in "{format}" format')
@given('I have requested an export in "{format}" format')
def step_impl(context, format):
    payload = {
        "study_id": context.study_id,
        "format": format
    }
    with patch('app.api.v1.routes_exports.export_study_task.delay') as mock_delay:
        mock_delay.return_value.id = str(uuid.uuid4())
        context.response = context.client.post(
            "/api/v1/exports/",
            json=payload,
            headers=context.user_token_headers
        )
        if context.response.status_code == 202:
            context.export_job_id = context.response.json()["job_id"]

@when('I request the status of the export job')
def step_impl(context):
    with patch('app.api.v1.routes_exports.AsyncResult') as mock_result:
        mock_result.return_value.state = "PENDING"
        context.response = context.client.get(
            f"/api/v1/exports/{context.export_job_id}",
            headers=context.user_token_headers
        )

@then('the response should contain the export status')
def step_impl(context):
    assert "status" in context.response.json()

@given('I have a completed export job')
def step_impl(context):
    context.export_job_id = str(uuid.uuid4())

@when('I request the download URL for the export')
def step_impl(context):
    with patch('app.api.v1.routes_exports.AsyncResult') as mock_result:
        mock_result.return_value.state = "SUCCESS"
        mock_result.return_value.result = "https://s3.mock/export.csv"
        context.response = context.client.get(
            f"/api/v1/exports/{context.export_job_id}/download-url",
            headers=context.user_token_headers
        )

@then('the response should contain a download URL')
def step_impl(context):
    assert "download_url" in context.response.json()
