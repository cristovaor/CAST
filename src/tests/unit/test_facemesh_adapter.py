from unittest.mock import Mock

from app.ml.facemesh import FaceMeshAdapter


def test_adapter_forwards_video_id_to_extractor():
    adapter = FaceMeshAdapter.__new__(FaceMeshAdapter)
    adapter.extractor = Mock()
    adapter.extractor.extract_from_video.return_value = "landmarks"

    result = adapter.extract_from_video("/tmp/video.mp4", "video-123")

    assert result == "landmarks"
    adapter.extractor.extract_from_video.assert_called_once_with(
        "/tmp/video.mp4",
        "video-123",
    )
