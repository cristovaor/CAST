"""Isolated one-video MediaPipe entry point used by the Celery worker."""
from __future__ import annotations

import argparse
from pathlib import Path

from cast.vision.facemesh_extractor import FaceMeshExtractor


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--min-detection-confidence", type=float, default=0.5)
    parser.add_argument("--min-tracking-confidence", type=float, default=0.5)
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    dataframe = FaceMeshExtractor(
        min_detection_confidence=args.min_detection_confidence,
        min_tracking_confidence=args.min_tracking_confidence,
    ).extract_from_video(
        args.video,
        args.video_id,
    )
    dataframe.to_pickle(output)


if __name__ == "__main__":
    main()
