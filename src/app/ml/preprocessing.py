"""Preprocessing adapter for landmarks."""
from __future__ import annotations

import pandas as pd
from cast.vision.normalization import normalize_landmarks_dataframe
from cast.config.landmarks import FACEMESH_REGIONS

def preprocess_landmarks(df_raw: pd.DataFrame, mode: str = "paper_formula") -> pd.DataFrame:
    """Normalize landmarks and extract regions.
    
    Args:
        df_raw: Raw landmarks DataFrame from FaceMesh.
        mode: Normalization mode.
        
    Returns:
        DataFrame with normalized coordinates.
    """
    return normalize_landmarks_dataframe(df_raw, FACEMESH_REGIONS, mode=mode)
