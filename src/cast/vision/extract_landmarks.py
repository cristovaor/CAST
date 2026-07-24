import argparse
import os
from pathlib import Path
import pandas as pd

from cast.vision.facemesh_extractor import FaceMeshExtractor

def main():
    parser = argparse.ArgumentParser(description="Extract landmarks from videos.")
    parser.add_argument("--videos-dir", required=True, type=str, help="Directory containing raw videos.")
    parser.add_argument("--output", required=True, type=str, help="Output Parquet file for raw landmarks.")
    parser.add_argument("--refine-landmarks", type=lambda x: str(x).lower() == 'true', default=True)
    args = parser.parse_args()

    videos_dir = Path(args.videos_dir)
    output_file = Path(args.output)
    
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    extractor = FaceMeshExtractor(refine_landmarks=args.refine_landmarks)
    
    all_records = []
    
    for video_path in videos_dir.glob("*.mp4"):
        print(f"Processing video: {video_path.name}")
        # Using filename stem as video_id
        video_id = video_path.stem
        df = extractor.extract_from_video(str(video_path), video_id)
        all_records.append(df)
        
    if all_records:
        final_df = pd.concat(all_records, ignore_index=True)
        final_df.to_parquet(output_file, index=False)
        print(f"Saved extracted landmarks to {output_file}")
    else:
        print("No videos processed.")

if __name__ == "__main__":
    main()
