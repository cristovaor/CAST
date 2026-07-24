from behave import when, then

@when('I request the health check endpoint')
def step_impl(context):
    context.response = context.client.get("/api/v1/health")


@then('the response should contain status "{expected_status}"')
def step_impl(context, expected_status):
    data = context.response.json()
    assert data.get("status") == expected_status, f"Expected status {expected_status}, got {data.get('status')}"
