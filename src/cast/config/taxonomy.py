"""Canonical taxonomy for automatic and human facial-movement annotation.

The taxonomy intentionally describes observable movement only.  It must not be
used to infer emotions, cognitive state, or a clinical condition.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

MULTI_ACTION_CODE = "MULTI"

AnnotationSide = Literal[
    "left", "right", "both", "center", "whole", "unspecified"
]


@dataclass(frozen=True)
class AnnotationCategory:
    code: str
    label: str
    group: str
    shortcut: int | None = None
    default_side: AnnotationSide = "unspecified"
    region: str | None = None
    experimental: bool = False

    def to_api(self) -> dict[str, Any]:
        return {
            key: value
            for key, value in asdict(self).items()
            if value is not None
        }


CORE_CATEGORIES: tuple[AnnotationCategory, ...] = (
    AnnotationCategory("OF", "Olho fechado", "eyes", 1, "both", "eyes"),
    AnnotationCategory("OC", "Desvio do olhar", "gaze", 2, "both", "irises"),
    AnnotationCategory("ML", "Movimento dos lábios", "mouth", 3, "center", "lips"),
    AnnotationCategory("VR", "Movimento da cabeça", "head", 4, "whole", "face"),
    AnnotationCategory(
        "MSO", "Movimento da sobrancelha", "brows", 5, "both", "eyebrows"
    ),
)

EXPERIMENTAL_CATEGORIES: tuple[AnnotationCategory, ...] = (
    AnnotationCategory("SMILE", "Sorriso", "mouth", 6, "center", "lips", True),
    AnnotationCategory(
        "MOUTH_OPEN", "Boca aberta", "mouth", 7, "center", "lips", True
    ),
    AnnotationCategory(
        "LIP_PRESS", "Compressão labial", "mouth", 8, "center", "lips", True
    ),
    AnnotationCategory(
        "LIP_PUCKER", "Lábios projetados", "mouth", 9, "center", "lips", True
    ),
    AnnotationCategory(
        "BROW_RAISE",
        "Sobrancelha elevada",
        "brows",
        None,
        "both",
        "eyebrows",
        True,
    ),
    AnnotationCategory(
        "BROW_FURROW",
        "Sobrancelhas franzidas",
        "brows",
        None,
        "both",
        "eyebrows",
        True,
    ),
    AnnotationCategory(
        "SQUINT", "Olhos semicerrados", "eyes", None, "both", "eyes", True
    ),
)

ANNOTATION_CATEGORIES = CORE_CATEGORIES + EXPERIMENTAL_CATEGORIES
CORE_ACTIONS = tuple(item.code for item in CORE_CATEGORIES)
EXPERIMENTAL_ACTIONS = tuple(item.code for item in EXPERIMENTAL_CATEGORIES)
UNIFIED_ACTIONS = CORE_ACTIONS + EXPERIMENTAL_ACTIONS

HORIZONTAL_DIRECTIONS = ("left", "center", "right")
VERTICAL_DIRECTIONS = ("up", "center", "down")
HEAD_TILT_DIRECTIONS = ("left", "center", "right")

# Continuous, directly observable geometry produced for every valid frame.
CONTINUOUS_SIGNALS = (
    "yaw",
    "pitch",
    "roll",
    "gaze_horizontal_left",
    "gaze_vertical_left",
    "gaze_horizontal_right",
    "gaze_vertical_right",
    "gaze_horizontal",
    "gaze_vertical",
    "eye_open_left",
    "eye_open_right",
    "mouth_open",
    "smile_curvature",
    "lip_compression",
    "brow_height_left",
    "brow_height_right",
    "brow_furrow",
    "facial_asymmetry",
    "motion_eyes",
    "motion_irises",
    "motion_mouth",
    "motion_brows",
    "motion_head",
    "velocity_yaw",
    "velocity_pitch",
    "velocity_roll",
    "velocity_gaze_horizontal",
    "velocity_gaze_vertical",
    "acceleration_eyes",
    "acceleration_irises",
    "acceleration_mouth",
    "acceleration_brows",
    "acceleration_head",
    "flow_eyes",
    "flow_mouth",
    "flow_brows",
    "flow_face",
    "blur_score",
    "illumination_mean",
    "face_detected",
)


def category_for(code: str) -> AnnotationCategory | None:
    return next((item for item in ANNOTATION_CATEGORIES if item.code == code), None)


def categories_for_api() -> list[dict[str, Any]]:
    return [item.to_api() for item in ANNOTATION_CATEGORIES]


def annotation_group(code: str) -> str:
    category = category_for(code)
    return category.group if category else "custom"


def default_postprocessing() -> dict[str, dict[str, float]]:
    """Conservative high-coverage defaults, calibrated per model later.

    Durations are milliseconds so behavior remains stable across video FPS.
    """
    defaults: dict[str, dict[str, float]] = {}
    for code in UNIFIED_ACTIONS:
        defaults[code] = {
            "enter_threshold": 0.45,
            "exit_threshold": 0.35,
            "min_duration_ms": 66.0 if code in {"OF", "ML", "MSO"} else 100.0,
            "merge_gap_ms": 100.0 if code != "VR" else 150.0,
            "max_missing_ms": 100.0,
            "boundary_tolerance_ms": 200.0,
            "direction_dead_zone": 0.15,
        }
    return defaults
