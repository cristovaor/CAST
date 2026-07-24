from behave import given, when, then
from app.db.models import Organization, Project, Study, Participant, Session, VideoAsset, ProcessingJob
import uuid

@given('an uploaded video exists')
def step_impl(context):
    org = Organization(name="Test Org")
    context.db.add(org)
    context.db.commit()

    proj = Project(organization_id=org.id, name="Test Proj")
    context.db.add(proj)
    context.db.commit()

    study = Study(project_id=proj.id, name="Test Study")
    context.db.add(study)
    context.db.commit()

    participant = Participant(study_id=study.id, external_code="P01")
    context.db.add(participant)
    context.db.commit()
    context.participant_id = participant.id

    session = Session(participant_id=participant.id)
    context.db.add(session)
    context.db.commit()

    video = VideoAsset(session_id=session.id, storage_uri="s3://test/video.mp4")
    context.db.add(video)
    context.db.commit()
    context.video_id = video.id

@when('I request to start inference on the video')
def step_impl(context):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    context.response = context.client.post(
        f"/api/v1/videos/{context.video_id}/infer",
        json={"models": ["test_model"]},
        headers=headers
    )

@then('the response should contain a job_id')
def step_impl(context):
    data = context.response.json()
    assert "job_id" in data
    context.job_id = data["job_id"]

@given('an inference job has been started for the video')
def step_impl(context):
    # Call the start endpoint or create job manually
    step_impl_when_request_to_start(context)
    data = context.response.json()
    context.job_id = data["job_id"]

def step_impl_when_request_to_start(context):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    context.response = context.client.post(
        f"/api/v1/videos/{context.video_id}/infer",
        json={"models": ["test_model"]},
        headers=headers
    )

@when('I request the status of the inference job')
def step_impl(context):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    context.response = context.client.get(
        f"/api/v1/inference-jobs/{context.job_id}",
        headers=headers
    )

@then('the response should contain the job status')
def step_impl(context):
    data = context.response.json()
    assert "status" in data

@given('an inference job has completed for the video')
def step_impl(context):
    from app.db.models import ProcessingJob
    job = ProcessingJob(video_asset_id=context.video_id, status="succeeded", task_type="inference")
    context.db.add(job)
    context.db.commit()
    context.job_id = job.id

@when('I request the predictions for the video')
def step_impl(context):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    context.response = context.client.get(
        f"/api/v1/videos/{context.video_id}/predictions",
        headers=headers
    )

@then('the response should contain prediction results')
def step_impl(context):
    assert isinstance(context.response.json(), list)

@when('I request the descriptors for the video')
def step_impl(context):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    context.response = context.client.get(
        f"/api/v1/videos/{context.video_id}/descriptors",
        headers=headers
    )

@then('the response should contain descriptor actions')
def step_impl(context):
    assert isinstance(context.response.json(), list)
