from behave import given, when, then
from app.db.models import Participant, Session as DBSession
import uuid

@when('I request the global dashboard')
def step_impl(context):
    context.response = context.client.get(
        "/api/v1/dashboard/global",
        headers=context.user_token_headers
    )

@then('the response should contain dashboard KPIs')
def step_impl(context):
    data = context.response.json()
    assert "kpis" in data
    assert "active_projects" in data["kpis"]

@given('I have created a session for a participant')
def step_impl(context):
    # Let's create a quick DB session to add a participant and session manually for this test
    # so we don't have to rely on previous steps.
    db = context.TestingSessionLocal()
    p = Participant(external_code=f"TEST_{uuid.uuid4().hex[:8]}")
    db.add(p)
    db.commit()
    db.refresh(p)
    
    s = DBSession(participant_id=p.id)
    db.add(s)
    db.commit()
    db.refresh(s)
    
    context.participant_id = str(p.id)
    context.session_id = str(s.id)
    db.close()

@when('I create an assessment of type "{type}" with score {score:f}')
@given('I have created an assessment of type "{type}" with score {score:f}')
def step_impl(context, type, score):
    payload = {
        "type": type,
        "score": score,
        "max_score": 10.0
    }
    context.response = context.client.post(
        f"/api/v1/sessions/{context.session_id}/assessments",
        json=payload,
        headers=context.user_token_headers
    )

@then('the response should contain the assessment score')
def step_impl(context):
    assert "score" in context.response.json()

@when('I request the assessments for the session')
def step_impl(context):
    context.response = context.client.get(
        f"/api/v1/sessions/{context.session_id}/assessments",
        headers=context.user_token_headers
    )

@then('the response should contain at least {count:d} assessment')
@then('the response should contain at least {count:d} assessments')
def step_impl(context, count):
    data = context.response.json()
    assert len(data) >= count
