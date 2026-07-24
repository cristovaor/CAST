import argparse
from pathlib import Path
import numpy as np
import pandas as pd
import tensorflow as tf

from cast.config.actions import ALL_ACTIONS
from cast.models.evaluation import predict_action, evaluate_frame_level, calculate_descriptor_errors
from cast.features.descriptors import build_video_descriptor

def main():
    parser = argparse.ArgumentParser(description="Reproduce the paper's results.")
    parser.add_argument("--models-dir", required=True, type=str, help="Directory containing trained models.")
    parser.add_argument("--windows-dir", required=True, type=str, help="Directory containing npz windows.")
    parser.add_argument("--output", required=True, type=str, help="Output markdown report file.")
    args = parser.parse_args()

    models_dir = Path(args.models_dir)
    windows_dir = Path(args.windows_dir)
    output_file = Path(args.output)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    results_by_video = {}
    groundtruth_by_video = {}

    for action in ALL_ACTIONS:
        print(f"Processing action {action}...")
        npz_path = windows_dir / f"{action}_windows.npz"
        if not npz_path.exists():
            continue
            
        data = np.load(npz_path, allow_pickle=True)
        X_all = data["X"]
        y_all = data["y"]
        vids_all = data["video_id"]
        
        unique_vids = np.unique(vids_all)
        
        for fold, test_vid in enumerate(unique_vids, 1):
            model_path = models_dir / f"{action}_fold_{fold:02d}.keras"
            if not model_path.exists():
                print(f"Warning: {model_path} not found.")
                continue
                
            model = tf.keras.models.load_model(model_path)
            
            test_mask = vids_all == test_vid
            X_test = X_all[test_mask]
            y_test = y_all[test_mask]
            
            if len(X_test) == 0:
                continue
                
            _, preds = predict_action(model, X_test, threshold=0.5)
            
            if test_vid not in results_by_video:
                results_by_video[test_vid] = {}
                groundtruth_by_video[test_vid] = {}
                
            results_by_video[test_vid][action] = preds
            
            # Extract groundtruth
            y_true_binary = np.argmax(y_test, axis=1)
            groundtruth_by_video[test_vid][action] = y_true_binary

    # Calculate Descriptors
    print("Calculating final descriptors...")
    descriptors_predicted = []
    descriptors_groundtruth = []
    
    total_pred = {a: 0 for a in ALL_ACTIONS}
    total_gt = {a: 0 for a in ALL_ACTIONS}

    for vid in results_by_video.keys():
        desc_pred = build_video_descriptor(results_by_video[vid])
        desc_gt = build_video_descriptor(groundtruth_by_video[vid])
        
        desc_pred["video_id"] = vid
        desc_gt["video_id"] = vid
        
        for a in ALL_ACTIONS:
            total_pred[a] += desc_pred.get(a, 0)
            total_gt[a] += desc_gt.get(a, 0)
            
        descriptors_predicted.append(desc_pred)
        descriptors_groundtruth.append(desc_gt)

    df_errors = calculate_descriptor_errors(total_gt, total_pred)
    df_errors.to_csv(output_file.with_name("descriptor_errors.csv"), index=False)
    
    # Write Markdown Report
    with open(output_file, 'w') as f:
        f.write("# Model Replication Report\n\n")
        f.write("## Descriptor Errors\n\n")
        f.write(df_errors.to_markdown(index=False))
        f.write("\n\n## Aggregated Predictions vs Groundtruth\n\n")
        
        f.write("| Action | Annotated | Predicted | Relative Error |\n")
        f.write("|---|---:|---:|---:|\n")
        for _, row in df_errors.iterrows():
            f.write(f"| {row['action']} | {row['annotated']} | {row['predicted']} | {row['relative_error']:.2%} |\n")

    print(f"Report generated at {output_file}")

if __name__ == "__main__":
    main()
