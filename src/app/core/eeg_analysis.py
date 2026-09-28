"""Lightweight workflow contract shared by the API and EEG worker."""

EEG_ANALYSIS_WORKFLOW_VERSION = "individual-derived-v1"
INDIVIDUAL_STAGES = ("preprocess", "power", "timeseries", "topomaps", "stats", "mdmp")


def individual_stages(parameters: dict) -> tuple[str, ...]:
    stages = parameters.get("stages", INDIVIDUAL_STAGES)
    if not isinstance(stages, (list, tuple)) or not all(
        isinstance(stage, str) and stage in INDIVIDUAL_STAGES for stage in stages
    ):
        raise ValueError(f"stages must be a list containing only {', '.join(INDIVIDUAL_STAGES)}")
    if not stages:
        raise ValueError("stages cannot be empty")
    requested = set(stages)
    # Derived stages consume full artifacts, never a preview from the API.
    if "topomaps" in requested:
        requested.add("power")
    if "mdmp" in requested:
        requested.add("timeseries")
    return tuple(stage for stage in INDIVIDUAL_STAGES if stage in requested)
