import argparse
from pathlib import Path
import numpy as np
import pandas as pd

from cast.config.settings import TRAINING_CONFIG
from cast.models.training import train_model, save_manifest
from cast.config.actions import ALL_ACTIONS

def main():
    parser = argparse.ArgumentParser(description="Train using leave-one-video-out cross-validation.")
    parser.add_argument("--action", type=str, help="Specific action to train (e.g., OF, OC).")
    parser.add_argument("--all-actions", action="store_true", help="Train all actions.")
    parser.add_argument("--feature-mode", type=str, default="roi_features")
    parser.add_argument("--epochs", type=int, default=TRAINING_CONFIG["epochs"])
    parser.add_argument("--batch-size", type=int, default=TRAINING_CONFIG["batch_size"])
    parser.add_argument("--learning-rate", type=float, default=TRAINING_CONFIG["learning_rate"])
    parser.add_argument("--windows-dir", type=str, default="data/processed/windows")
    parser.add_argument("--output-dir", type=str, default="models/checkpoints")
    parser.add_argument("--manifests-dir", type=str, default="models/manifests")
    args = parser.parse_args()

    actions_to_train = ALL_ACTIONS if args.all_actions else [args.action]
    
    config = TRAINING_CONFIG.copy()
    config["epochs"] = args.epochs
    config["batch_size"] = args.batch_size
    config["learning_rate"] = args.learning_rate

    for action in actions_to_train:
        print(f"\n--- Training {action} ---")
        npz_path = Path(args.windows_dir) / f"{action}_windows.npz"
        if not npz_path.exists():
            print(f"File not found: {npz_path}")
            continue
            
        data = np.load(npz_path, allow_pickle=True)
        X_all = data["X"]
        y_all = data["y"]
        vids_all = data["video_id"]
        
        unique_vids = np.unique(vids_all)
        
        # We simulate 9 folds as per the spec for leave-one-video-out
        for fold, test_vid in enumerate(unique_vids, 1):
            print(f"\nFold {fold}: Test Video {test_vid}")
            
            test_mask = vids_all == test_vid
            train_mask = ~test_mask
            
            X_train, y_train = X_all[train_mask], y_all[train_mask]
            X_test, y_test = X_all[test_mask], y_all[test_mask]
            
            if len(X_train) == 0 or len(X_test) == 0:
                print("Not enough data for this fold. Skipping.")
                continue
                
            model, history = train_model(
                X_train, y_train,
                X_test, y_test,
                config
            )
            
            # Save Model
            out_model = Path(args.output_dir) / f"{action}_fold_{fold:02d}.keras"
            out_model.parent.mkdir(parents=True, exist_ok=True)
            model.save(out_model)
            print(f"Saved model to {out_model}")
            
            # Save Manifest
            manifest = {
                "model_name": f"{action}_lstm",
                "micro_action": action,
                "fold": fold,
                "test_video_id": str(test_vid),
                "feature_mode": args.feature_mode,
                "n_features": int(X_train.shape[2]),
                "sequence_length": int(X_train.shape[1]),
                "training": config
            }
            out_manifest = Path(args.manifests_dir) / f"{action}_fold_{fold:02d}_manifest.yaml"
            save_manifest(manifest, str(out_manifest))

if __name__ == "__main__":
    main()
