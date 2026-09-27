import json

from cast_lsl_agent.app import MarkerRequest, marker, state


class FakeOutlet:
    def __init__(self):
        self.samples = []

    def push_sample(self, sample):
        self.samples.append(sample)


def test_marker_preserves_source_clock_timestamp():
    outlet = FakeOutlet()
    state.marker_outlet = outlet
    state.marker_ids.clear()

    result = marker(
        MarkerRequest(
            client_event_id="event-1",
            label="CAST marker",
            source_time_us=123456,
            source_clock_id="browser-performance",
        )
    )

    payload = json.loads(outlet.samples[0][0])
    assert result == {"accepted": True, "reused": False}
    assert payload["client_event_id"] == "event-1"
    assert payload["source_time_us"] == 123456
    assert payload["source_clock_id"] == "browser-performance"
