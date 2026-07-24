from typing import Dict, List

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
ALL_ACTIONS: List[str] = ["OF", "OC", "ML", "VR", "MSO"]

# Expected feature count per action (landmarks * 2 coords)
ACTION_FEATURE_COUNT: Dict[str, int] = {
    "OF": 64,   # 32 landmarks (16 right + 16 left eye) * 2
    "OC": 16,   # 8 landmarks (4 right + 4 left iris) * 2
    "ML": 80,   # 40 lip landmarks * 2
    "VR": 160,  # 80 face landmarks * 2
    "MSO": 40,  # 20 landmarks (10 right + 10 left eyebrow) * 2
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
