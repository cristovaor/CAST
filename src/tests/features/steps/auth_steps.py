from behave import given, when, then
from app.core.security import get_password_hash
from app.db.models import User

@given('a user exists with email "{email}" and password "{password}"')
def step_impl(context, email, password):
    user = User(
        email=email,
        hashed_password=get_password_hash(password),
        full_name="Test User",
        is_active=True
    )
    context.db.add(user)
    context.db.commit()
    context.db.refresh(user)
    context.test_user = user

@when('I attempt to login with email "{email}" and password "{password}"')
def step_impl(context, email, password):
    login_data = {
        "username": email,
        "password": password
    }
    context.response = context.client.post("/api/v1/auth/login", data=login_data)

@then('the response should contain an access token')
def step_impl(context):
    data = context.response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

@then('the response status code should be {status_code:d}')
def step_impl(context, status_code):
    assert context.response.status_code == status_code, f"Expected {status_code}, got {context.response.status_code}"
