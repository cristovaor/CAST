import numpy as np

from cast.postprocessing.unified import compact_unified_predictions


def test_compaction_preserves_simultaneous_actions_and_attributes():
    frames = np.arange(10)
    timestamps = frames * 100.0
    probabilities = {
        "OF": np.array([0, 0, .8, .9, .8, 0, 0, 0, 0, 0]),
        "OC": np.array([0, 0, .7, .8, .8, .8, .7, 0, 0, 0]),
    }
    gaze_horizontal = np.tile([0.8, 0.1, 0.1], (10, 1))
    gaze_vertical = np.tile([0.1, 0.1, 0.8], (10, 1))
    eye_side = np.zeros((10, 4))
    eye_side[2:5, :2] = 0.9

    events = compact_unified_predictions(
        probabilities,
        frames,
        timestamps,
        fps=10,
        direction_probabilities={
            "gaze_horizontal": gaze_horizontal,
            "gaze_vertical": gaze_vertical,
        },
        side_probabilities={"eye_side": eye_side},
    )

    eye = next(event for event in events if event.action_code == "OF")
    gaze = next(event for event in events if event.action_code == "OC")
    assert eye.start_frame == gaze.start_frame == 2
    assert eye.side == "both"
    assert eye.subtype == "blink"
    assert gaze.direction == {"horizontal": "left", "vertical": "down"}


def test_short_gaps_merge_and_long_missing_face_splits_events():
    frames = np.arange(12)
    timestamps = frames * 100.0
    probabilities = {
        "VR": np.array([0, .8, .8, .2, .8, .8, .8, .8, .8, .8, .8, 0]),
    }
    face = np.ones(12, dtype=bool)
    face[7:10] = False
    events = compact_unified_predictions(
        probabilities,
        frames,
        timestamps,
        fps=10,
        face_detected=face,
        calibration={
            "VR": {
                "enter_threshold": .45,
                "exit_threshold": .35,
                "min_duration_ms": 100,
                "merge_gap_ms": 150,
                "max_missing_ms": 100,
            }
        },
    )

    assert [(event.start_frame, event.end_frame) for event in events] == [
        (1, 6),
        (10, 10),
    ]


def test_sustained_direction_change_splits_one_probability_interval():
    frames = np.arange(10)
    timestamps = frames * 100.0
    scores = {"OC": np.array([0, .8, .8, .8, .8, .8, .8, .8, .8, 0])}
    horizontal = np.tile([0.85, 0.10, 0.05], (10, 1))
    horizontal[5:] = [0.05, 0.10, 0.85]
    vertical = np.tile([0.05, 0.90, 0.05], (10, 1))

    events = compact_unified_predictions(
        scores,
        frames,
        timestamps,
        fps=10,
        direction_probabilities={
            "gaze_horizontal": horizontal,
            "gaze_vertical": vertical,
        },
    )

    assert [(event.start_frame, event.end_frame) for event in events] == [
        (1, 4),
        (5, 8),
    ]
    assert [event.direction["horizontal"] for event in events] == [
        "left",
        "right",
    ]
