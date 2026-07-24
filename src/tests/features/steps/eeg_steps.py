from behave import given, when, then
from app.db.models import EEGAsset, Session

@when('I upload an EEG file via proxy')
def step_impl(context):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    
    # We create a dummy CSV file in memory to upload
    file_content = b"timestamp_ms,alpha,beta\n0,1.0,2.0\n10,1.1,2.1"
    files = {
        "file": ("test_eeg.csv", file_content, "text/csv")
    }
    data = {
        "participant_id": str(context.participant_id)
    }
    
    context.response = context.client.post(
        "/api/v1/eeg/upload-proxy",
        data=data,
        files=files,
        headers=headers
    )

@then('the response should contain an eeg_asset_id')
def step_impl(context):
    data = context.response.json()
    assert "eeg_asset_id" in data
    context.eeg_asset_id = data["eeg_asset_id"]

@given('an uploaded EEG asset exists')
def step_impl(context):
    step_impl_when_upload_eeg(context)
    data = context.response.json()
    context.eeg_asset_id = data["eeg_asset_id"]

def step_impl_when_upload_eeg(context):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    file_content = b"timestamp_ms,alpha,beta\n0,1.0,2.0\n10,1.1,2.1"
    files = {
        "file": ("test_eeg.csv", file_content, "text/csv")
    }
    data = {
        "participant_id": str(context.participant_id)
    }
    context.response = context.client.post(
        "/api/v1/eeg/upload-proxy",
        data=data,
        files=files,
        headers=headers
    )

@when('I request the EEG timeseries')
def step_impl(context):
    headers = {"Authorization": f"Bearer {context.token}"} if hasattr(context, "token") else {}
    context.response = context.client.get(
        f"/api/v1/eeg/{context.eeg_asset_id}/timeseries",
        headers=headers
    )

@then('the response should contain timeseries data')
def step_impl(context):
    data = context.response.json()
    assert "data" in data
    assert isinstance(data["data"], list)
