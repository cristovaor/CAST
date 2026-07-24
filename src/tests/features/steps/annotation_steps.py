from behave import given, when, then
from app.db.models import AnnotationTask

@when('I create an annotation task for the video')
def step_impl(context):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    payload = {
        "video_id": str(context.video_id),
        "assignee_id": str(context.test_user.id) if hasattr(context, "test_user") else str(context.participant_id)
    }
    context.response = context.client.post(
        "/api/v1/annotation-tasks/",
        json=payload,
        headers=headers
    )

@then('the response should contain a task_id')
def step_impl(context):
    data = context.response.json()
    assert "task_id" in data
    context.task_id = data["task_id"]

@given('an annotation task exists')
def step_impl(context):
    step_impl_when_create_task(context)
    data = context.response.json()
    context.task_id = data["task_id"]

def step_impl_when_create_task(context):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    payload = {
        "video_id": str(context.video_id),
        "assignee_id": str(context.test_user.id) if hasattr(context, "test_user") else str(context.participant_id)
    }
    context.response = context.client.post(
        "/api/v1/annotation-tasks/",
        json=payload,
        headers=headers
    )

@when('I add an annotation event from {start_time:g} to {end_time:g} seconds')
def step_impl(context, start_time, end_time):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    payload = {
        "action": "smile",
        "start_frame": int(start_time * 30),
        "end_frame": int(end_time * 30),
        "start_time": start_time,
        "end_time": end_time
    }
    context.response = context.client.post(
        f"/api/v1/annotation-tasks/{context.task_id}/events",
        json=payload,
        headers=headers
    )

@then('the response should contain an event_id')
def step_impl(context):
    data = context.response.json()
    assert "event_id" in data
