from app.services.video_quality_service import assess_video_quality


def test_assess_video_quality_approves_high_detection_no_issues():
    result = assess_video_quality(detection_rate=0.98, n_frames=1000, fps=30.0)
    assert result["verdict"] == "approved"
    assert result["findings"] == []
    assert result["faceDetectionRate"] == 0.98


def test_assess_video_quality_rejects_low_detection():
    result = assess_video_quality(detection_rate=0.3, n_frames=1000, fps=30.0)
    assert result["verdict"] == "rejected"
    assert any(f["tone"] == "danger" for f in result["findings"])


def test_assess_video_quality_requires_review_for_moderate_detection():
    result = assess_video_quality(detection_rate=0.6, n_frames=1000, fps=30.0)
    assert result["verdict"] == "review_required"


def test_assess_video_quality_caveats_for_invalid_frames():
    result = assess_video_quality(detection_rate=0.95, n_frames=1000, fps=30.0, invalid_frames=50)
    assert result["verdict"] == "approved_with_caveats"
    assert any(f["issue"].startswith("Frames inválidos") for f in result["findings"])
    assert result["validFrameRatio"] == 0.95
