import argparse
import os
from pathlib import Path
import pandas as pd
import numpy as np

from cast.features.regions import extract_features_for_action
from cast.features.windowing import make_windows
from cast.config.actions import ALL_ACTIONS
from cast.config.settings import SEQUENCE_LENGTH

def main():
    parser = argparse.ArgumentParser(description="Generate sliding windows for LSTM.")
    parser.add_argument("--landmarks", required=True, type=str, help="Normalized landmarks Parquet file.")
    parser.add_argument("--annotations", required=True, type=str, help="Frame labels CSV file.")
    parser.add_argument("--feature-mode", type=str, default="roi_features", help="Feature extraction mode.")
    parser.add_argument("--output-dir", required=True, type=str, help="Output directory for NPZ files.")
    args = parser.parse_args()

    landmarks_file = Path(args.landmarks)
    annotations_file = Path(args.annotations)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Loading normalized landmarks and annotations...")
    df_norm = pd.read_parquet(landmarks_file)
    df_ann = pd.read_csv(annotations_file)

    video_ids = df_norm["video_id"].unique()

    for action in ALL_ACTIONS:
        print(f"Generating windows for action: {action}")
        
        all_X = []
        all_y = []
        all_vid = []
        all_frames = []

        for vid in video_ids:
            df_vid_norm = df_norm[df_norm["video_id"] == vid]
            df_vid_ann = df_ann[df_ann["video_id"] == vid].sort_values("frame_idx")

            # Extract features for all available frames
            X_vid, frames_vid = extract_features_for_action(df_vid_norm, action, args.feature_mode)

            # Align annotations
            y_vid = []
            valid_mask = []
            
            # Create mapping for fast lookup
            ann_map = dict(zip(df_vid_ann["frame_idx"], df_vid_ann[action]))
            
            for f in frames_vid:
                if f in ann_map:
                    y_vid.append(ann_map[f])
                    valid_mask.append(True)
                else:
                    y_vid.append(0)
                    valid_mask.append(False)
                    
            y_vid = np.array(y_vid)
            
            # One-hot encode y: [prob_neg, prob_pos]
            y_onehot = np.zeros((len(y_vid), 2), dtype=int)
            y_onehot[:, 1] = y_vid
            y_onehot[:, 0] = 1 - y_vid

            X_w, y_w, target_idx = make_windows(X_vid, y_onehot, SEQUENCE_LENGTH)
            
            if X_w.size > 0:
                all_X.append(X_w)
                all_y.append(y_w)
                all_vid.extend([vid] * len(X_w))
                # Map relative window index to actual frame index
                all_frames.extend([frames_vid[idx] for idx in target_idx])

        if all_X:
            X_concat = np.concatenate(all_X, axis=0)
            y_concat = np.concatenate(all_y, axis=0)
            vid_array = np.array(all_vid)
            frame_array = np.array(all_frames)

            output_path = output_dir / f"{action}_windows.npz"
            np.savez_compressed(
                output_path,
                X=X_concat,
                y=y_concat,
                video_id=vid_array,
                target_frame_idx=frame_array,
                action=action,
                feature_mode=args.feature_mode,
            )
            print(f"Saved {output_path} (shape: {X_concat.shape})")
        else:
            print(f"No valid windows generated for {action}.")

if __name__ == "__main__":
    main()
