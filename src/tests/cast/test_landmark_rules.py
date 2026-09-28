import numpy as np
import pandas as pd

from cast.config.landmarks import FACEMESH_REGIONS
from cast.heuristics.landmark_rules import detect_micro_actions

FPS = 30.0
FRAMES = 300

# A frontal face in normalized image coordinates; only the points the rules use.
BASE_FACE = {
    33: (0.40, 0.40), 133: (0.46, 0.40), 362: (0.54, 0.40), 263: (0.60, 0.40),
    160: (0.425, 0.39), 158: (0.445, 0.39), 153: (0.445, 0.41), 144: (0.425, 0.41),
    385: (0.555, 0.39), 387: (0.575, 0.39), 373: (0.575, 0.41), 380: (0.555, 0.41),
    469: (0.438, 0.40), 470: (0.43, 0.392), 471: (0.422, 0.40), 472: (0.43, 0.408),
    474: (0.578, 0.40), 475: (0.57, 0.392), 476: (0.562, 0.40), 477: (0.57, 0.408),
    1: (0.50, 0.47),
    61: (0.46, 0.55), 291: (0.54, 0.55), 13: (0.50, 0.545), 14: (0.50, 0.555),
    **{
        point: (0.40 + 0.006 * index, 0.35)
        for index, point in enumerate(FACEMESH_REGIONS["sobrancelha_direita"])
    },
    **{
        point: (0.54 + 0.006 * index, 0.35)
        for index, point in enumerate(FACEMESH_REGIONS["sobrancelha_esquerda"])
    },
}


def _raw(changes=None, missing_frames=(), seed=7):
    rng = np.random.default_rng(seed)
    rows = []
    for frame in range(FRAMES):
        if frame in missing_frames:
            rows.append({
                "frame_idx": frame, "landmark_idx": -1, "x": np.nan,
                "y": np.nan, "z": np.nan, "face_detected": False,
            })
            continue
        points = dict(BASE_FACE)
        for (start, end), change in (changes or {}).items():
            if start <= frame <= end:
                change(points)
        for point, (x, y) in points.items():
            rows.append({
                "frame_idx": frame,
                "landmark_idx": point,
                "x": x + rng.normal(0, 0.0005),
                "y": y + rng.normal(0, 0.0005),
                "z": 0.0,
                "face_detected": True,
            })
    return pd.DataFrame(rows)


def _shift(ids, dx=0.0, dy=0.0):
    def change(points):
        for point in ids:
            x, y = points[point]
            points[point] = (x + dx, y + dy)
    return change


def _close_eyes(points):
    for upper, lower in ((160, 144), (158, 153), (385, 380), (387, 373)):
        points[upper] = (points[upper][0], 0.4)
        points[lower] = (points[lower][0], 0.4)


def _events_by_action(result):
    grouped = {}
    for event in result.events:
        grouped.setdefault(event.action_code, []).append(event)
    return grouped


def test_still_face_produces_no_suggestions():
    result = detect_micro_actions(_raw(), fps=FPS)

    assert result.events == []
    assert result.face_detection_rate == 1.0


def test_each_action_is_found_from_point_distances():
    raw = _raw({
        (50, 58): _close_eyes,
        (100, 115): _shift([14], dy=0.025),
        (150, 170): _shift([1], dx=0.04),
        (200, 215): _shift(FACEMESH_REGIONS["sobrancelha_esquerda"], dy=-0.02),
        (250, 265): _shift([469, 470, 471, 472, 474, 475, 476, 477], dx=0.012),
    })

    events = _events_by_action(detect_micro_actions(raw, fps=FPS))

    assert set(events) == {"OF", "ML", "VR", "MSO", "OC"}
    for action, (start, end) in {
        "OF": (50, 58), "ML": (100, 115), "VR": (150, 170),
        "MSO": (200, 215), "OC": (250, 265),
    }.items():
        assert len(events[action]) == 1, action
        event = events[action][0]
        assert abs(event.start_frame - start) <= 2, action
        assert abs(event.end_frame - end) <= 2, action
        assert 0.5 <= event.confidence <= 1.0

    assert events["OF"][0].side == "both"
    assert events["OF"][0].subtype == "blink"
    assert events["MSO"][0].side == "left"
    # Positive offsets point towards the participant's left eye (point 263).
    assert events["VR"][0].direction["horizontal"] == "left"
    assert events["OC"][0].direction["horizontal"] == "left"


def test_one_closed_eye_is_a_wink_on_that_side():
    def close_right(points):
        for upper, lower in ((160, 144), (158, 153)):
            points[upper] = (points[upper][0], 0.4)
            points[lower] = (points[lower][0], 0.4)

    events = _events_by_action(
        detect_micro_actions(_raw({(80, 90): close_right}), fps=FPS)
    )

    assert [event.side for event in events["OF"]] == ["right"]
    assert events["OF"][0].subtype == "wink"


def test_baseline_is_per_video_not_absolute():
    # A participant whose mouth rests open: the resting gap is the baseline.
    resting_open = _shift([14], dy=0.02)
    raw = _raw({(0, FRAMES - 1): resting_open})

    assert detect_micro_actions(raw, fps=FPS).events == []


def test_frames_without_face_never_become_events():
    raw = _raw(missing_frames=set(range(120, 180)))

    result = detect_micro_actions(raw, fps=FPS)

    assert result.events == []
    assert result.face_detection_rate == 0.8
