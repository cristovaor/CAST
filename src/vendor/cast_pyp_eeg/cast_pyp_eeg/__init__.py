"""Service-safe Pyp-EEG adaptation.

Imports intentionally stay light: optional scientific dependencies are loaded
only when an analysis function is called.
"""

from .config import (
    AnalysisConfig,
    Band,
    Block,
    Contrast,
    ROI,
    StudyDesign,
)
from .pipeline import (
    compute_band_power,
    compute_mdmp,
    compute_mirror_plots,
    compute_paired_stats,
    compute_timeseries_power,
    compute_topomaps,
    preprocess_recording,
    run_pipeline,
)
from .results import AnalysisResult, Artifact, PipelineResult
from .version import __version__

__all__ = [
    "__version__",
    "AnalysisConfig",
    "AnalysisResult",
    "Artifact",
    "Band",
    "Block",
    "Contrast",
    "PipelineResult",
    "ROI",
    "StudyDesign",
    "compute_band_power",
    "compute_mdmp",
    "compute_mirror_plots",
    "compute_paired_stats",
    "compute_timeseries_power",
    "compute_topomaps",
    "preprocess_recording",
    "run_pipeline",
]

