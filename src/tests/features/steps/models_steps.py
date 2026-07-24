from behave import given, when, then

@when('I register a model "{model_id}" version "{version}" with action "{action}"')
def step_impl(context, model_id, version, action):
    headers = getattr(context, "user_token_headers", {})
    payload = {
        "model_id": model_id,
        "version": version,
        "action": action,
        "manifest": {"author": "Test", "framework": "PyTorch"},
        "artifact_uri": "s3://models/test.pt",
        "notes": "Test model"
    }
    context.response = context.client.post("/api/v1/models", json=payload, headers=headers)

@then('the response should contain the model version "{version}"')
def step_impl(context, version):
    data = context.response.json()
    assert data["version"] == version
    context.model_version_id = data["id"]

@given('I have registered a model "{model_id}" version "{version}" with action "{action}"')
def step_impl(context, model_id, version, action):
    headers = getattr(context, "user_token_headers", {})
    payload = {
        "model_id": model_id,
        "version": version,
        "action": action,
        "manifest": {"author": "Test", "framework": "PyTorch"},
        "artifact_uri": "s3://models/test.pt",
        "notes": "Test model"
    }
    response = context.client.post("/api/v1/models", json=payload, headers=headers)
    assert response.status_code == 201

@when('I request the list of models')
def step_impl(context):
    headers = getattr(context, "user_token_headers", {})
    context.response = context.client.get("/api/v1/models", headers=headers)

@then('the response should contain at least {count:d} model')
def step_impl(context, count):
    data = context.response.json()
    assert len(data) >= count