from behave import given, when, then
from app.db.models import Participant, Session as DBSession, VideoAsset
import uuid

@given('a valid participant ID')
def step_impl(context):
    db = context.db
    p = Participant(external_code=f"UPLOAD_{uuid.uuid4().hex[:8]}")
    db.add(p)
    db.commit()
    db.refresh(p)
    
    s = DBSession(participant_id=p.id)
    db.add(s)
    db.commit()
    db.refresh(s)
    
    context.participant_id = str(p.id)
    context.session_id = str(s.id)

@when('I request an upload URL for "{filename}"')
def step_impl(context, filename):
    payload = {
        "session_id": context.session_id,
        "filename": filename,
        "mime_type": "video/mp4"
    }
    from unittest.mock import patch
    with patch('app.api.v1.routes_videos.storage_service.get_presigned_upload_url') as mock_url, \
         patch('app.api.v1.routes_videos.storage_service.s3'):
        mock_url.return_value = "https://s3.mock/presigned_url"
        context.response = context.client.post(
            "/api/v1/videos/upload-url",
            json=payload,
            headers=context.user_token_headers
        )
        if context.response.status_code in [200, 201]:
            context.video_asset_id = context.response.json().get("video_asset_id")

@then('I should receive a valid presigned URL')
def step_impl(context):
    assert context.response.status_code in [200, 201], f"Expected 200/201, got {context.response.status_code}: {context.response.text}"
    assert "upload_url" in context.response.json()

@then('a VideoAsset draft should be created in the database')
def step_impl(context):
    assert "video_asset_id" in context.response.json()
    db = context.db
    video = db.query(VideoAsset).filter(VideoAsset.id == context.response.json()["video_asset_id"]).first()
    assert video is not None
