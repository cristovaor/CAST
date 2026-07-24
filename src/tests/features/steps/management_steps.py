from behave import given, when, then
import json

@when('I create a study with name "{name}"')
def step_impl(context, name):
    if not getattr(context, "project_id", None):
        # Auto-create project
        project_data = {"name": "Auto Project", "description": "Auto generated"}
        resp = context.client.post("/api/v1/projects/", json=project_data, headers=context.user_token_headers)
        context.project_id = resp.json()["id"]

    payload = {
        "name": name,
        "description": "Test description",
        "start_date": "2026-01-01T00:00:00Z",
        "project_id": context.project_id
    }
    context.response = context.client.post(
        "/api/v1/studies/",
        json=payload,
        headers=context.user_token_headers
    )
    if context.response.status_code == 200:
        context.study_id = context.response.json()["id"]

@given('I have created a study with name "{name}"')
def step_impl(context, name):
    if not getattr(context, "project_id", None):
        # Auto-create project
        project_data = {"name": "Auto Project", "description": "Auto generated"}
        resp = context.client.post("/api/v1/projects/", json=project_data, headers=context.user_token_headers)
        context.project_id = resp.json()["id"]

    payload = {
        "name": name,
        "description": "Test description",
        "start_date": "2026-01-01T00:00:00Z",
        "project_id": context.project_id
    }
    response = context.client.post(
        "/api/v1/studies/",
        json=payload,
        headers=context.user_token_headers
    )
    assert response.status_code == 200
    context.study_id = response.json()["id"]

@then('the response should contain the study name "{name}"')
def step_impl(context, name):
    assert context.response.json()["name"] == name

@when('I request the list of studies')
def step_impl(context):
    context.response = context.client.get(
        "/api/v1/studies/",
        headers=context.user_token_headers
    )

@then('the response should contain at least {count:d} studies')
def step_impl(context, count):
    data = context.response.json()
    assert len(data) >= count

@when('I update the study name to "{name}"')
def step_impl(context, name):
    context.response = context.client.patch(
        f"/api/v1/studies/{context.study_id}",
        json={"name": name},
        headers=context.user_token_headers
    )

@when('I trigger batch inference for the study')
def step_impl(context):
    context.response = context.client.post(
        f"/api/v1/studies/{context.study_id}/batch-infer",
        headers=context.user_token_headers
    )

@then('the response should contain a message about started jobs')
def step_impl(context):
    assert "job_ids" in context.response.json()

@when('I request to export the study data')
def step_impl(context):
    context.response = context.client.get(
        f"/api/v1/studies/{context.study_id}/export",
        headers=context.user_token_headers
    )

@then('the response should contain CSV content')
def step_impl(context):
    assert "text/csv" in context.response.headers["Content-Type"]
    assert "Participant_Code" in context.response.text

# Participants

@when('I create a participant with code "{code}"')
def step_impl(context, code):
    payload = {
        "study_id": context.study_id,
        "external_code": code,
        "demographic_group": "test_group"
    }
    context.response = context.client.post(
        "/api/v1/participants/",
        json=payload,
        headers=context.user_token_headers
    )
    if context.response.status_code == 200:
        context.participant_id = context.response.json()["id"]

@given('I have created a participant with code "{code}" in this study')
def step_impl(context, code):
    payload = {
        "study_id": context.study_id,
        "external_code": code,
        "demographic_group": "test_group"
    }
    response = context.client.post(
        "/api/v1/participants/",
        json=payload,
        headers=context.user_token_headers
    )
    assert response.status_code == 200
    context.participant_id = response.json()["id"]

@then('the response should contain the participant code "{code}"')
def step_impl(context, code):
    # Could be a list or a single object depending on the step
    data = context.response.json()
    if isinstance(data, list):
        codes = [p["external_code"] for p in data]
        assert code in codes
    else:
        assert data["external_code"] == code

@when('I request the list of participants for this study')
def step_impl(context):
    context.response = context.client.get(
        f"/api/v1/participants/study/{context.study_id}",
        headers=context.user_token_headers
    )

@when('I update the participant consent to "{status}"')
def step_impl(context, status):
    context.response = context.client.post(
        f"/api/v1/participants/{context.participant_id}/consent?status={status}",
        headers=context.user_token_headers
    )

@when('I request deletion for the participant')
def step_impl(context):
    context.response = context.client.post(
        f"/api/v1/participants/{context.participant_id}/deletion-request",
        headers=context.user_token_headers
    )

@then('the response should confirm the deletion request')
def step_impl(context):
    assert "deletion request accepted" in context.response.json()["message"].lower()
