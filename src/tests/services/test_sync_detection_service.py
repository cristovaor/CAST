from app.services.sync_detection_service import propose_sync


def test_propose_sync_recovers_known_positive_lag():
    """EEG activity burst occurs 5s AFTER the corresponding facial event ->
    the proposed offset should be positive and close to +5000ms."""
    facial_events = [{"start_time": 10.0, "end_time": 10.5}]
    rows = []
    for t in range(0, 20000, 250):
        near_burst = abs(t - 15000) < 500
        rows.append({"timestamp_ms": t, "ch1": 200.0 if near_burst else 10.0})

    result = propose_sync(facial_events, rows, video_duration_ms=20000)

    assert result["method"] == "event_correlation"
    assert result["offset_ms"] == 5000
    assert result["confidence"] > 0.8


def test_propose_sync_handles_insufficient_signal():
    result = propose_sync([], [], video_duration_ms=0)
    assert result["offset_ms"] == 0
    assert result["confidence"] == 0.0
    assert "insuficiente" in result["note"].lower()


def test_propose_sync_confidence_bounded_between_0_and_1():
    facial_events = [{"start_time": 1.0, "end_time": 1.5}, {"start_time": 8.0, "end_time": 8.5}]
    rows = [{"timestamp_ms": t, "ch1": (t % 37)} for t in range(0, 10000, 250)]  # noisy/unrelated
    result = propose_sync(facial_events, rows, video_duration_ms=10000)
    assert 0.0 <= result["confidence"] <= 1.0
