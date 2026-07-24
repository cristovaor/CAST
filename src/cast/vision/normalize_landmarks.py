import argparse
from pathlib import Path
import pandas as pd

from cast.vision.normalization import normalize_landmarks_dataframe
from cast.config.landmarks import FACEMESH_REGIONS

def main():
    parser = argparse.ArgumentParser(description="Normalize landmarks using regional approach.")
    parser.add_argument("--input", required=True, type=str, help="Input raw landmarks Parquet file.")
    parser.add_argument("--output", required=True, type=str, help="Output normalized landmarks Parquet file.")
    parser.add_argument("--mode", type=str, default="paper_formula", help="Normalization mode.")
    args = parser.parse_args()

    input_file = Path(args.input)
    output_file = Path(args.output)
    
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"Loading raw landmarks from {input_file}...")
    df_raw = pd.read_parquet(input_file)
    
    print(f"Normalizing landmarks with mode '{args.mode}'...")
    df_norm = normalize_landmarks_dataframe(df_raw, FACEMESH_REGIONS, mode=args.mode)
    
    df_norm.to_parquet(output_file, index=False)
    print(f"Saved normalized landmarks to {output_file}")

if __name__ == "__main__":
    main()
