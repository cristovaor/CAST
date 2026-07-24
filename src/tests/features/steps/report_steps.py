from behave import given, when, then

@given('a valid study ID')
def step_impl(context):
    from app.db.models import Organization, Project, Study
    org = Organization(name="Test Org Reports")
    context.db.add(org)
    context.db.commit()

    proj = Project(organization_id=org.id, name="Test Proj Reports")
    context.db.add(proj)
    context.db.commit()

    study = Study(project_id=proj.id, name="Test Study Reports")
    context.db.add(study)
    context.db.commit()
    context.study_id = study.id

@when('I request the dashboard metrics for the study')
def step_impl(context):
    headers = getattr(context, "user_token_headers", {})
    context.response = context.client.get(f"/api/v1/studies/{context.study_id}/dashboard", headers=headers)

@then('the response should contain the dashboard metrics')
def step_impl(context):
    data = context.response.json()
    assert "total_participants" in data