from typing import Dict, List

from cast.config.taxonomy import CORE_ACTIONS

# Regions used per action for feature extraction
ACTION_REGIONS: Dict[str, List[str]] = {
    "OF": ["olho_direito", "olho_esquerdo"],
    "OC": ["iris_direita", "iris_esquerda"],
    "ML": ["labios"],
    "VR": ["olho_direito", "olho_esquerdo", "iris_direita", "iris_esquerda",
            "sobrancelha_direita", "sobrancelha_esquerda", "labios", "nariz", "contorno_rosto"],
    "MSO": ["sobrancelha_direita", "sobrancelha_esquerda"],
}

# Canonical ordered list of actions in v6 (MSO restored — original v6 notebook micro-action)
ALL_ACTIONS: List[str] = list(CORE_ACTIONS)

# Expected feature count per action (landmarks * 2 coords)
def action_feature_count(action: str) -> int:
    """Derive feature count from the canonical landmark list.

    This avoids stale hard-coded counts when an action's region list changes.
    """
    from cast.config.landmarks import get_points

    return len(get_points(ACTION_REGIONS[action])) * 2


ACTION_FEATURE_COUNT: Dict[str, int] = {
    action: action_feature_count(action) for action in ALL_ACTIONS
}

# Default inference thresholds per action (calibrated per specs v6)
ACTION_THRESHOLDS: Dict[str, float] = {
    "OF": 0.50,
    "OC": 0.55,
    "ML": 0.60,
    "VR": 0.55,
    "MSO": 0.55,
}

# Minimum consecutive frames to constitute an event
MIN_RUN_LENGTH: int = 3
