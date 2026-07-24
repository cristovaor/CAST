from behave import given, when, then
from app.db.models import User, UserRole
import uuid

@when('I request the organization settings')
def step_impl(context):
    context.response = context.client.get(
        "/api/v1/settings/organization",
        headers=context.user_token_headers
    )

@then('the response should contain the organization name')
def step_impl(context):
    assert "name" in context.response.json()

@when('I update the pipeline face detection threshold to {threshold:f}')
def step_impl(context, threshold):
    payload = {
        "face_detection_threshold": threshold
    }
    context.response = context.client.patch(
        "/api/v1/settings/pipeline",
        json=payload,
        headers=context.user_token_headers
    )

@then('the response should reflect the new pipeline settings')
def step_impl(context):
    assert "face_detection_threshold" in context.response.json()

@when('I request the list of users')
def step_impl(context):
    context.response = context.client.get(
        "/api/v1/users/",
        headers=context.user_token_headers
    )

@then('the response should contain at least {count:d} user')
@then('the response should contain at least {count:d} users')
def step_impl(context, count):
    data = context.response.json()
    assert len(data) >= count

@when('I invite a new user "{email}" as "{role}"')
def step_impl(context, email, role):
    payload = {
        "email": email,
        "role": role
    }
    context.response = context.client.post(
        "/api/v1/users/invite",
        json=payload,
        headers=context.user_token_headers
    )

@then('the response should confirm the invite')
def step_impl(context):
    assert "status" in context.response.json()

@given('I have another user in the same organization')
def step_impl(context):
    db = context.db
    # The authenticated user's email from environment.py or auth_steps is "test@example.com"
    # we need its org id
    main_user = db.query(User).filter(User.email == "test@example.com").first()
    if not main_user:
        # Fallback to just grabbing the first user
        main_user = db.query(User).first()
        
    other_user = User(
        email=f"other_{uuid.uuid4().hex[:4]}@example.com",
        password_hash="fake",
        name="Other User",
        organization_id=main_user.organization_id if main_user else None
    )
    db.add(other_user)
    db.commit()
    db.refresh(other_user)
    context.other_user_id = str(other_user.id)

@when('I delete the other user')
def step_impl(context):
    context.response = context.client.delete(
        f"/api/v1/users/{context.other_user_id}",
        headers=context.user_token_headers
    )


