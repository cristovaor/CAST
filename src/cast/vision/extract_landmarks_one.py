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
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    dataframe = FaceMeshExtractor().extract_from_video(
        args.video,
        args.video_id,
    )
    dataframe.to_pickle(output)


if __name__ == "__main__":
    main()
