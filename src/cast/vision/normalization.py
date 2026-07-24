import numpy as np
import pandas as pd

def normalize_region(points: np.ndarray, mode: str = "paper_formula", eps: float = 1e-8) -> np.ndarray:
    """
    Normalizes a set of 2D points (x, y) based on their bounding box.
    """
    if points.size == 0:
        return points

    xs = points[:, 0]
    ys = points[:, 1]

    x_min, x_max = xs.min(), xs.max()
    y_min, y_max = ys.min(), ys.max()

    x_norm = (xs - x_min) / max(x_max - x_min, eps)
    y_norm = (ys - y_min) / max(y_max - y_min, eps)

    if mode == "centered":
        x_norm = x_norm - 0.5
        y_norm = y_norm - 0.5

    return np.stack([x_norm, y_norm], axis=1)

def normalize_landmarks_dataframe(df_raw: pd.DataFrame, regions_dict: dict, mode: str = "paper_formula") -> pd.DataFrame:
    """
    Takes a raw DataFrame of landmarks and applies regional normalization.
    """
    normalized_records = []
    
    # Process per video and per frame
    grouped = df_raw[df_raw["face_detected"] == True].groupby(["video_id", "frame_idx"])
    
    for (video_id, frame_idx), group in grouped:
        # Create a mapping of landmark_idx to (x, y)
        lm_map = dict(zip(group["landmark_idx"], zip(group["x"], group["y"])))
        
        for region_name, indices in regions_dict.items():
            # Get points for the region
            pts = []
            valid_indices = []
            for idx in indices:
                if idx in lm_map:
                    pts.append(lm_map[idx])
                    valid_indices.append(idx)
                    
            if not pts:
                continue
                
            pts_array = np.array(pts)
            norm_pts = normalize_region(pts_array, mode=mode)
            
            for i, idx in enumerate(valid_indices):
                normalized_records.append({
                    "video_id": video_id,
                    "frame_idx": frame_idx,
                    "region": region_name,
                    "landmark_idx": idx,
                    "x_norm": norm_pts[i, 0],
                    "y_norm": norm_pts[i, 1],
                    "normalization_mode": mode
                })
                
    return pd.DataFrame(normalized_records)
