import numpy as np
import pandas as pd
from typing import List, Dict

from cast.config.landmarks import get_points, DEFAULT_100_POINT_REGIONS
from cast.config.actions import ACTION_REGIONS

def extract_features_for_action(df_norm: pd.DataFrame, action: str, feature_mode: str) -> np.ndarray:
    """
    Extracts features for a specific action from a normalized DataFrame.
    Returns array of shape (n_frames, n_features)
    """
    if feature_mode == "strict_fig49":
        target_regions = DEFAULT_100_POINT_REGIONS
    elif feature_mode == "roi_features":
        target_regions = ACTION_REGIONS.get(action, DEFAULT_100_POINT_REGIONS)
    else:
        raise ValueError(f"Unknown feature_mode: {feature_mode}")
        
    target_points = get_points(target_regions)
    n_features = len(target_points) * 2  # x, y for each point
    
    # Sort frames to ensure temporal order
    frames = sorted(df_norm["frame_idx"].unique())
    n_frames = len(frames)
    
    X = np.zeros((n_frames, n_features), dtype=np.float32)
    
    # Pre-compute a map from landmark_idx to feature column index
    lm_to_col = {}
    col_idx = 0
    for lm_idx in target_points:
        lm_to_col[lm_idx] = col_idx
        col_idx += 2
        
    # Pivot or iterate to build the matrix
    df_filtered = df_norm[df_norm["landmark_idx"].isin(target_points)]
    
    frame_to_row = {f: i for i, f in enumerate(frames)}
    
    for _, row in df_filtered.iterrows():
        f_idx = row["frame_idx"]
        lm_idx = row["landmark_idx"]
        if f_idx in frame_to_row and lm_idx in lm_to_col:
            r = frame_to_row[f_idx]
            c = lm_to_col[lm_idx]
            X[r, c] = row["x_norm"]
            X[r, c + 1] = row["y_norm"]
            
    return X, frames
