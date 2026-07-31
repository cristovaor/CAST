from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from .config import AnalysisConfig
from .pipeline import run_pipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cast-pyp-eeg")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--config", type=Path)
    parser.add_argument(
        "--stages",
        nargs="+",
        choices=("preprocess", "power", "timeseries"),
        default=("preprocess", "power", "timeseries"),
    )
    parser.add_argument(
        "--profile",
        choices=("custom", "pyp_eeg_v2"),
        default="custom",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.config:
        config = AnalysisConfig.from_dict(json.loads(args.config.read_text(encoding="utf-8")))
    elif args.profile == "pyp_eeg_v2":
        config = AnalysisConfig.pyp_eeg_v2()
    else:
        config = AnalysisConfig()
    result = run_pipeline(args.input, args.output, config, stages=args.stages)
    print(json.dumps(result.to_dict(), ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
