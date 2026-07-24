from behave import given, when, then
from tests.utils import create_random_user
from app.core.security import create_access_token

@given('I am an authenticated user')
def step_impl(context):
    user = create_random_user(context.db)
    access_token = create_access_token(user.id)
    context.user_token_headers = {"Authorization": f"Bearer {access_token}"}
    context.test_user = user

@when('I create a project with name "{name}" and description "{description}"')
def step_impl(context, name, description):
    project_data = {
        "name": name,
        "description": description
    }
    context.response = context.client.post(
        "/api/v1/projects/", 
        json=project_data,
        headers=context.user_token_headers
    )

@then('the response should contain the project name "{name}"')
def step_impl(context, name):
    data = context.response.json()
    assert data["name"] == name

@given('I have created a project with name "{name}"')
def step_impl(context, name):
    project_data = {
        "name": name,
        "description": "Auto generated"
    }
    response = context.client.post(
        "/api/v1/projects/", 
        json=project_data,
        headers=context.user_token_headers
    )
    assert response.status_code == 200
    context.project_id = response.json()["id"]

@when('I request the list of projects')
def step_impl(context):
    context.response = context.client.get(
        "/api/v1/projects/",
        headers=context.user_token_headers
    )

@then('the response should contain at least {count:d} projects')
def step_impl(context, count):
    data = context.response.json()
    assert len(data) >= count
