from __future__ import annotations

import csv
import gzip
import hashlib
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from .config import AnalysisConfig, Contrast, StudyDesign, normalize_config
from .results import AnalysisResult, Artifact, PipelineResult
from .version import MDMP_COMMIT, MDMP_VERSION, UPSTREAM_COMMIT, __version__


def _scientific() -> tuple[Any, Any, Any]:
    """Import optional, heavy dependencies only when analysis is requested."""
    import numpy as np
    import pandas as pd
    from scipy import signal, stats

    return np, pd, (signal, stats)


def _provenance(config: AnalysisConfig, **extra: Any) -> dict[str, Any]:
    result = {
        "package": "cast-pyp-eeg",
        "package_version": __version__,
        "upstream_commit": UPSTREAM_COMMIT,
        "mdmp_version": MDMP_VERSION,
        "mdmp_commit": MDMP_COMMIT,
        "profile": config.profile,
        "random_seed": config.random_seed,
        "ica_random_state": config.ica_random_state,
        "configuration": config.to_dict(),
    }
    result.update(extra)
    return result


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default),
        encoding="utf-8",
    )


def _json_default(value: Any) -> Any:
    if hasattr(value, "item"):
        return value.item()
    if hasattr(value, "tolist"):
        return value.tolist()
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _filename_slug(value: Any) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value)).strip("._")
    return slug[:80] or "unnamed"


def _read_raw(path: str | Path, *, preload: bool = True) -> Any:
    import mne

    source = Path(path)
    suffix = source.suffix.lower()
    if suffix == ".csv":
        np, pd, _ = _scientific()
        frame = pd.read_csv(source)
        time_columns = [
            name
            for name in ("time_seconds", "timestamp_ms", "time", "timestamp")
            if name in frame.columns
        ]
        numeric = frame.select_dtypes(include="number")
        channels = [name for name in numeric.columns if name not in time_columns]
        if not channels:
            raise ValueError("CSV contains no numeric EEG channel columns")
        sfreq = 256.0
        if time_columns and len(frame) > 1:
            differences = np.diff(frame[time_columns[0]].astype(float).to_numpy())
            interval = float(np.nanmedian(differences[differences > 0]))
            if time_columns[0] == "timestamp_ms":
                interval /= 1000.0
            if interval > 0 and math.isfinite(interval):
                sfreq = 1.0 / interval
        data = numeric[channels].astype(float).to_numpy().T
        # CAST's legacy CSV contract stores amplitudes in microvolts.
        data = data * 1e-6
        info = mne.create_info(channels, sfreq=sfreq, ch_types="eeg")
        return mne.io.RawArray(data, info, verbose="ERROR")
    readers = {
        ".edf": mne.io.read_raw_edf,
        ".bdf": mne.io.read_raw_bdf,
        ".fif": mne.io.read_raw_fif,
        ".set": mne.io.read_raw_eeglab,
        ".vhdr": mne.io.read_raw_brainvision,
    }
    if suffix not in readers:
        raise ValueError(f"unsupported EEG format: {suffix or '<none>'}")
    return readers[suffix](source, preload=preload, verbose="ERROR")


def _safe_filter(raw: Any, config: AnalysisConfig, warnings: list[str]) -> None:
    nyquist = float(raw.info["sfreq"]) / 2.0
    high = min(config.filter_high_hz, nyquist - 0.01)
    if high <= config.filter_low_hz:
        raise ValueError(
            f"sampling frequency {raw.info['sfreq']} Hz is too low for the configured filter"
        )
    if high != config.filter_high_hz:
        warnings.append(
            f"filter_high_hz reduced from {config.filter_high_hz:g} to {high:g} Hz "
            "because of Nyquist"
        )
    raw.filter(config.filter_low_hz, high, picks="eeg", verbose="ERROR")
    valid_notches = tuple(freq for freq in config.notch_hz if 0 < freq < nyquist)
    skipped = tuple(freq for freq in config.notch_hz if freq not in valid_notches)
    if skipped:
        warnings.append(f"notch frequencies above Nyquist omitted: {skipped}")
    if valid_notches:
        raw.notch_filter(valid_notches, picks="eeg", verbose="ERROR")


def preprocess_recording(
    input_path: str | Path,
    output_dir: str | Path,
    config: AnalysisConfig | Mapping[str, Any] | None = None,
) -> AnalysisResult:
    cfg = normalize_config(config)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []
    raw = _read_raw(input_path)

    if cfg.montage:
        try:
            raw.set_montage(cfg.montage, on_missing="warn", verbose="ERROR")
        except Exception as exc:
            warnings.append(f"montage {cfg.montage!r} could not be applied: {exc}")
    _safe_filter(raw, cfg, warnings)
    if cfg.reference == "average":
        raw.set_eeg_reference("average", projection=False, verbose="ERROR")
    elif cfg.reference and cfg.reference != "none":
        raw.set_eeg_reference([cfg.reference], projection=False, verbose="ERROR")

    removed: list[dict[str, Any]] = []
    if cfg.apply_ica:
        try:
            from mne.preprocessing import ICA
            from mne_icalabel import label_components

            eeg_count = len(raw.copy().pick("eeg").ch_names)
            if eeg_count < 3:
                warnings.append("ICA omitted: fewer than three EEG channels")
            else:
                ica = ICA(
                    n_components=min(eeg_count - 1, 30),
                    method=cfg.ica_method,
                    fit_params={"extended": True} if cfg.ica_method == "infomax" else None,
                    random_state=cfg.ica_random_state,
                    max_iter="auto",
                )
                ica.fit(raw, picks="eeg", verbose="ERROR")
                labels = label_components(raw, ica, method="iclabel")
                probabilities = labels.get("y_pred_proba", ())
                for index, (label, probability) in enumerate(
                    zip(labels.get("labels", ()), probabilities)
                ):
                    threshold = cfg.iclabel_thresholds.get(str(label))
                    if threshold is not None and float(probability) >= threshold:
                        removed.append(
                            {
                                "component": index,
                                "label": str(label),
                                "probability": float(probability),
                                "threshold": threshold,
                            }
                        )
                ica.exclude = [item["component"] for item in removed]
                if ica.exclude:
                    ica.apply(raw, verbose="ERROR")
                else:
                    warnings.append("ICA completed without rejected components")
        except Exception as exc:
            warnings.append(f"ICA/ICLabel omitted: {exc}")

    clean_path = output / "cleaned_raw.fif"
    raw.save(clean_path, overwrite=True, verbose="ERROR")
    block_artifacts: list[Artifact] = []
    duration = float(raw.times[-1]) if raw.n_times else 0.0
    for block in cfg.blocks:
        if block.start_seconds >= duration:
            warnings.append(f"block {block.label!r} omitted: starts after recording end")
            continue
        block_raw = raw.copy().crop(
            tmin=block.start_seconds,
            tmax=min(block.end_seconds, duration),
            include_tmax=False,
        )
        block_path = output / "blocks" / f"{_filename_slug(block.label)}.fif"
        block_path.parent.mkdir(parents=True, exist_ok=True)
        block_raw.save(block_path, overwrite=True, verbose="ERROR")
        block_artifacts.append(
            Artifact.from_path(
                "preprocessed-block",
                block_path,
                "application/x-fiff",
                metadata={"block": block.label},
            )
        )

    report = {
        "input": str(Path(input_path)),
        "input_sha256": _sha256(Path(input_path)),
        "sampling_frequency_hz": float(raw.info["sfreq"]),
        "duration_seconds": duration,
        "channels": list(raw.ch_names),
        "bad_channels": list(raw.info["bads"]),
        "removed_components": removed,
        "warnings": warnings,
        "provenance": _provenance(cfg),
    }
    report_path = output / "preprocessing.json"
    _write_json(report_path, report)
    return AnalysisResult(
        kind="preprocessing",
        artifacts=(
            Artifact.from_path("preprocessed-fif", clean_path, "application/x-fiff"),
            Artifact.from_path("preprocessing-report", report_path, "application/json"),
            *block_artifacts,
        ),
        metrics={
            "duration_seconds": duration,
            "channel_count": len(raw.ch_names),
            "removed_component_count": len(removed),
            "block_count": len(block_artifacts),
        },
        warnings=tuple(warnings),
        units={"duration": "s", "sampling_frequency": "Hz"},
        provenance=_provenance(cfg),
    )


def _welch_rows(raw: Any, cfg: AnalysisConfig, state: str) -> tuple[list[dict[str, Any]], Any, Any]:
    np, _, scipy = _scientific()
    signal, _ = scipy
    picked = raw.copy().pick("eeg")
    data = picked.get_data()
    sfreq = float(picked.info["sfreq"])
    nperseg = min(data.shape[1], max(8, round(cfg.welch_segment_seconds * sfreq)))
    noverlap = min(nperseg - 1, round(nperseg * cfg.welch_overlap))
    frequencies, psd = signal.welch(
        data,
        fs=sfreq,
        nperseg=nperseg,
        noverlap=noverlap,
        axis=-1,
        scaling="density",
    )
    total_mask = (frequencies >= cfg.psd_low_hz) & (
        frequencies <= min(cfg.psd_high_hz, sfreq / 2.0)
    )
    total = np.trapezoid(psd[:, total_mask], frequencies[total_mask], axis=1)
    rows: list[dict[str, Any]] = []
    for channel_index, channel in enumerate(picked.ch_names):
        for band in cfg.bands:
            mask = (frequencies >= band.low_hz) & (frequencies < band.high_hz)
            if mask.sum() < 2:
                continue
            absolute = float(
                np.trapezoid(psd[channel_index, mask], frequencies[mask])
                * cfg.absolute_power_scale
            )
            relative = (
                float(
                    np.trapezoid(psd[channel_index, mask], frequencies[mask])
                    / total[channel_index]
                )
                if total[channel_index] > 0
                else math.nan
            )
            rows.append(
                {
                    "state": state,
                    "level": "channel",
                    "channel": channel,
                    "roi": None,
                    "band": band.name,
                    "absolute_power": absolute,
                    "relative_power": relative,
                }
            )
    for roi in cfg.rois:
        available = [channel for channel in roi.channels if channel in picked.ch_names]
        if not available:
            continue
        for band in cfg.bands:
            selected = [
                row
                for row in rows
                if row["level"] == "channel"
                and row["channel"] in available
                and row["band"] == band.name
            ]
            if not selected:
                continue
            rows.append(
                {
                    "state": state,
                    "level": "roi",
                    "channel": None,
                    "roi": roi.name,
                    "band": band.name,
                    "absolute_power": float(
                        np.nanmean([row["absolute_power"] for row in selected])
                    ),
                    "relative_power": float(
                        np.nanmean([row["relative_power"] for row in selected])
                    ),
                    "channel_coverage": len(available) / len(roi.channels),
                    "channels_used": available,
                }
            )
    return rows, frequencies, (psd * cfg.absolute_power_scale)


def compute_band_power(
    recording: str | Path | Any,
    output_dir: str | Path,
    config: AnalysisConfig | Mapping[str, Any] | None = None,
    *,
    state: str = "recording",
) -> AnalysisResult:
    cfg = normalize_config(config)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    raw = _read_raw(recording) if isinstance(recording, (str, Path)) else recording
    rows, frequencies, psd = _welch_rows(raw, cfg, state)
    _, pd, _ = _scientific()
    power_path = output / "power.csv"
    pd.DataFrame(rows).to_csv(power_path, index=False)
    spectrum = {
        "schema": "eeg-result-v1",
        "state": state,
        "units": {"frequency": "Hz", "psd": "uV^2/Hz"},
        "channels": list(raw.copy().pick("eeg").ch_names),
        "frequencies": frequencies.tolist(),
        "psd": psd.tolist(),
        "power": rows,
        "provenance": _provenance(cfg),
    }
    result_path = output / "power.json"
    _write_json(result_path, spectrum)
    return AnalysisResult(
        kind="power",
        artifacts=(
            Artifact.from_path("power-csv", power_path, "text/csv", units="uV^2"),
            Artifact.from_path("power-json", result_path, "application/json", units="uV^2"),
        ),
        metrics={"row_count": len(rows), "frequency_bin_count": len(frequencies)},
        units={
            "absolute_power": "uV^2",
            "relative_power": "ratio",
            "psd": "uV^2/Hz",
        },
        provenance=_provenance(cfg),
    )


def _downsample_rows(rows: Sequence[Mapping[str, Any]], limit: int) -> list[Mapping[str, Any]]:
    if len(rows) <= limit:
        return list(rows)
    stride = max(1, math.ceil(len(rows) / limit))
    return list(rows[::stride])[:limit]


def compute_timeseries_power(
    recording: str | Path | Any,
    output_dir: str | Path,
    config: AnalysisConfig | Mapping[str, Any] | None = None,
    *,
    state: str = "recording",
) -> AnalysisResult:
    cfg = normalize_config(config)
    output = Path(output_dir)
    tile_dir = output / "tiles"
    tile_dir.mkdir(parents=True, exist_ok=True)
    raw = _read_raw(recording) if isinstance(recording, (str, Path)) else recording
    np, pd, scipy = _scientific()
    signal, _ = scipy
    picked = raw.copy().pick("eeg")
    data = picked.get_data()
    sfreq = float(picked.info["sfreq"])
    window = max(8, round(cfg.timeseries_window_seconds * sfreq))
    step = max(1, round(cfg.timeseries_step_seconds * sfreq))
    if data.shape[1] < window:
        raise ValueError("recording is shorter than the configured time-series window")
    rows: list[dict[str, Any]] = []
    for start in range(0, data.shape[1] - window + 1, step):
        frequencies, psd = signal.welch(data[:, start : start + window], fs=sfreq, axis=-1)
        time_seconds = (start + window / 2) / sfreq
        for band in cfg.bands:
            mask = (frequencies >= band.low_hz) & (frequencies < band.high_hz)
            if mask.sum() < 2:
                continue
            values = np.trapezoid(psd[:, mask], frequencies[mask], axis=1)
            by_channel = dict(zip(picked.ch_names, values))
            for roi in cfg.rois:
                available = [by_channel[channel] for channel in roi.channels if channel in by_channel]
                if available:
                    rows.append(
                        {
                            "time_seconds": time_seconds,
                            "state": state,
                            "roi": roi.name,
                            "band": band.name,
                            "metric": "absolute_power",
                            "value": float(np.mean(available) * cfg.absolute_power_scale),
                            "channel_coverage": len(available) / len(roi.channels),
                        }
                    )
            if not cfg.rois:
                for channel, value in by_channel.items():
                    rows.append(
                        {
                            "time_seconds": time_seconds,
                            "state": state,
                            "channel": channel,
                            "roi": None,
                            "band": band.name,
                            "metric": "absolute_power",
                            "value": float(value * cfg.absolute_power_scale),
                            "channel_coverage": 1.0,
                        }
                    )

    csv_path = output / "timeseries.csv"
    pd.DataFrame(rows).to_csv(csv_path, index=False)
    grouped: dict[tuple[int, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        tile = int(float(row["time_seconds"]) // cfg.tile_seconds)
        grouped[(tile, str(row.get("roi") or row.get("channel")), str(row["band"]))].append(row)
    tiles: list[dict[str, Any]] = []
    for (tile, scope, band), tile_rows in grouped.items():
        for resolution, stride in (("full", 1), ("4x", 4), ("16x", 16)):
            selected_rows = tile_rows[::stride]
            payload = {
                "schema": "eeg-result-v1",
                "resolution": resolution,
                "tile": tile,
                "scope": scope,
                "band": band,
                "points": selected_rows,
            }
            tile_path = tile_dir / (
                f"{tile:06d}-{_filename_slug(scope)}-"
                f"{_filename_slug(band)}-{resolution}.json.gz"
            )
            with tile_path.open("wb") as target:
                with gzip.GzipFile(
                    filename="",
                    mode="wb",
                    fileobj=target,
                    mtime=0,
                ) as stream:
                    stream.write(
                        json.dumps(
                            payload,
                            ensure_ascii=False,
                            separators=(",", ":"),
                            default=_json_default,
                        ).encode("utf-8")
                    )
            tiles.append(
                {
                    "tile": tile,
                    "scope": scope,
                    "band": band,
                    "resolution": resolution,
                    "start_seconds": tile * cfg.tile_seconds,
                    "end_seconds": (tile + 1) * cfg.tile_seconds,
                    "path": tile_path.name,
                    "point_count": len(selected_rows),
                    "content_encoding": "gzip",
                }
            )
    index = {
        "schema": "eeg-result-v1",
        "units": {"time": "s", "value": "uV^2"},
        "tile_seconds": cfg.tile_seconds,
        "tiles": tiles,
        "preview": _downsample_rows(rows, 2000),
        "provenance": _provenance(cfg),
    }
    index_path = output / "timeseries-index.json"
    _write_json(index_path, index)
    artifacts = [
        Artifact.from_path("timeseries-csv", csv_path, "text/csv", units="uV^2"),
        Artifact.from_path(
            "timeseries-index", index_path, "application/json", units="uV^2"
        ),
    ]
    artifacts.extend(
        Artifact.from_path(
            "timeseries-tile",
            tile_dir / tile["path"],
            "application/gzip",
            units="uV^2",
            metadata={key: value for key, value in tile.items() if key != "path"},
        )
        for tile in tiles
    )
    return AnalysisResult(
        kind="timeseries",
        artifacts=tuple(artifacts),
        metrics={"point_count": len(rows), "tile_count": len(tiles)},
        units={"time": "s", "absolute_power": "uV^2"},
        provenance=_provenance(cfg),
    )


def _bh_fdr(p_values: Sequence[float]) -> list[float]:
    finite = [(index, value) for index, value in enumerate(p_values) if math.isfinite(value)]
    result = [math.nan] * len(p_values)
    if not finite:
        return result
    ordered = sorted(finite, key=lambda item: item[1])
    previous = 1.0
    adjusted: dict[int, float] = {}
    count = len(ordered)
    for rank, (index, value) in reversed(list(enumerate(ordered, start=1))):
        previous = min(previous, value * count / rank)
        adjusted[index] = previous
    for index, value in adjusted.items():
        result[index] = value
    return result


def _cohen_dz(a: Any, b: Any) -> float:
    np, _, _ = _scientific()
    delta = np.asarray(b, dtype=float) - np.asarray(a, dtype=float)
    deviation = float(np.std(delta, ddof=1)) if len(delta) > 1 else math.nan
    return float(np.mean(delta) / deviation) if deviation and math.isfinite(deviation) else math.nan


def compute_paired_stats(
    data: str | Path | Sequence[Mapping[str, Any]],
    output_dir: str | Path,
    design: StudyDesign,
    *,
    value_column: str = "value",
    dimensions: Sequence[str] = ("band", "roi"),
    config: AnalysisConfig | Mapping[str, Any] | None = None,
) -> AnalysisResult:
    cfg = normalize_config(config)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    np, pd, scipy = _scientific()
    _, stats = scipy
    frame = pd.read_csv(data) if isinstance(data, (str, Path)) else pd.DataFrame(data)
    contrasts = design.contrasts or tuple(
        Contrast(f"{a}_vs_{b}", design.condition_column, a, b)
        for a, b in design.session_pairs
    )
    results: list[dict[str, Any]] = []
    warnings: list[str] = []
    group_keys: Any = list(dimensions) if dimensions else lambda _: 0
    for key, subset in frame.groupby(group_keys, dropna=False):
        labels = key if isinstance(key, tuple) else (key,)
        dimension_values = dict(zip(dimensions, labels))
        for contrast in contrasts:
            if contrast.factor not in subset.columns:
                warnings.append(f"contrast {contrast.name!r} omitted: factor column absent")
                continue
            a_rows = subset[subset[contrast.factor] == contrast.level_a]
            b_rows = subset[subset[contrast.factor] == contrast.level_b]
            merged = a_rows.merge(
                b_rows,
                on=design.subject_column,
                suffixes=("_a", "_b"),
            )
            a = merged[f"{value_column}_a"].astype(float).to_numpy()
            b = merged[f"{value_column}_b"].astype(float).to_numpy()
            finite = np.isfinite(a) & np.isfinite(b)
            a, b = a[finite], b[finite]
            n = len(a)
            if n < 2:
                warnings.append(f"contrast {contrast.name!r} omitted: fewer than two pairs")
                continue
            differences = b - a
            shapiro_p = float(stats.shapiro(differences).pvalue) if 3 <= n <= 5000 else math.nan
            normal = math.isfinite(shapiro_p) and shapiro_p >= 0.05
            if normal:
                test = stats.ttest_rel(b, a, nan_policy="omit")
                test_name = "paired_t"
            else:
                try:
                    test = stats.wilcoxon(b, a)
                    test_name = "wilcoxon"
                except ValueError:
                    test = type("ConstantTest", (), {"statistic": 0.0, "pvalue": 1.0})()
                    test_name = "wilcoxon_constant"
            mean_a, mean_b = float(np.mean(a)), float(np.mean(b))
            results.append(
                {
                    **dimension_values,
                    "contrast": contrast.name,
                    "level_a": contrast.level_a,
                    "level_b": contrast.level_b,
                    "test": test_name,
                    "normality_shapiro_p": shapiro_p,
                    "n": n,
                    "mean_a": mean_a,
                    "mean_b": mean_b,
                    "difference": mean_b - mean_a,
                    "percent_change": (
                        ((mean_b - mean_a) / abs(mean_a)) * 100 if mean_a else math.nan
                    ),
                    "statistic": float(test.statistic),
                    "p": float(test.pvalue),
                    "cohen_d_z": _cohen_dz(a, b),
                }
            )
    q_values = _bh_fdr([row["p"] for row in results])
    for row, q_value in zip(results, q_values):
        row["q"] = q_value
        row["significant_fdr"] = bool(math.isfinite(q_value) and q_value < cfg.fdr_alpha)
    csv_path = output / "stats.csv"
    pd.DataFrame(results).to_csv(csv_path, index=False)
    json_path = output / "stats.json"
    _write_json(
        json_path,
        {
            "schema": "eeg-result-v1",
            "results": results,
            "warnings": warnings,
            "provenance": _provenance(cfg, study_design=design.to_dict()),
        },
    )
    return AnalysisResult(
        kind="stats",
        artifacts=(
            Artifact.from_path("stats-csv", csv_path, "text/csv"),
            Artifact.from_path("stats-json", json_path, "application/json"),
        ),
        metrics={"comparison_count": len(results)},
        warnings=tuple(dict.fromkeys(warnings)),
        units={"percent_change": "%", "effect_size": "Cohen d_z"},
        provenance=_provenance(cfg, study_design=design.to_dict()),
    )


def compute_topomaps(
    data: str | Path | Sequence[Mapping[str, Any]],
    output_dir: str | Path,
    *,
    value_column: str = "value",
    channel_column: str = "channel",
    group_columns: Sequence[str] = ("band", "condition"),
    config: AnalysisConfig | Mapping[str, Any] | None = None,
) -> AnalysisResult:
    cfg = normalize_config(config)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    _, pd, _ = _scientific()
    frame = pd.read_csv(data) if isinstance(data, (str, Path)) else pd.DataFrame(data)
    artifacts: list[Artifact] = []
    matrices: list[dict[str, Any]] = []
    warnings: list[str] = []
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import mne

        for key, subset in frame.groupby(list(group_columns), dropna=False):
            labels = key if isinstance(key, tuple) else (key,)
            group = dict(zip(group_columns, labels))
            channel_values = subset.groupby(channel_column)[value_column].mean()
            info = mne.create_info(list(channel_values.index), sfreq=1.0, ch_types="eeg")
            info.set_montage(cfg.montage or "standard_1020", on_missing="ignore")
            positions = [
                index
                for index, channel in enumerate(info.ch_names)
                if not math.isnan(float(info["chs"][index]["loc"][0]))
            ]
            if len(positions) < 3:
                warnings.append(f"topomap omitted for {group}: fewer than three positioned channels")
                continue
            values = channel_values.to_numpy()[positions]
            reduced = mne.pick_info(info, positions)
            fig, ax = plt.subplots(figsize=(5, 4))
            mne.viz.plot_topomap(values, reduced, axes=ax, show=False, contours=6)
            ax.set_title(" · ".join(str(value) for value in labels))
            slug = "-".join(_filename_slug(value) for value in labels)
            path = output / f"topomap-{slug}.png"
            fig.savefig(path, dpi=160, bbox_inches="tight")
            plt.close(fig)
            artifacts.append(
                Artifact.from_path("topomap-png", path, "image/png", metadata=group)
            )
            matrices.append(
                {
                    **group,
                    "channels": [reduced.ch_names[index] for index in range(len(values))],
                    "values": values.tolist(),
                    "image": path.name,
                }
            )
    except Exception as exc:
        warnings.append(f"topomap generation omitted: {exc}")
    json_path = output / "topomaps.json"
    _write_json(
        json_path,
        {
            "schema": "eeg-result-v1",
            "topomaps": matrices,
            "warnings": warnings,
            "provenance": _provenance(cfg),
        },
    )
    artifacts.append(Artifact.from_path("topomaps-json", json_path, "application/json"))
    return AnalysisResult(
        kind="topomaps",
        artifacts=tuple(artifacts),
        metrics={"topomap_count": len(matrices)},
        warnings=tuple(warnings),
        provenance=_provenance(cfg),
    )


def compute_mirror_plots(
    data: str | Path | Sequence[Mapping[str, Any]],
    output_dir: str | Path,
    *,
    x_column: str = "condition",
    value_column: str = "value",
    series_column: str = "band",
    config: AnalysisConfig | Mapping[str, Any] | None = None,
) -> AnalysisResult:
    cfg = normalize_config(config)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    _, pd, _ = _scientific()
    frame = pd.read_csv(data) if isinstance(data, (str, Path)) else pd.DataFrame(data)
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figure, axis = plt.subplots(figsize=(9, 5))
    for name, subset in frame.groupby(series_column):
        summary = subset.groupby(x_column)[value_column].agg(["mean", "sem"]).reset_index()
        axis.errorbar(summary[x_column], summary["mean"], yerr=summary["sem"], marker="o", label=name)
    axis.axhline(0, color="#64748b", linewidth=0.8)
    axis.legend()
    axis.set_xlabel(x_column)
    axis.set_ylabel(value_column)
    path = output / "mirror-plot.png"
    figure.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(figure)
    return AnalysisResult(
        kind="mirror-plots",
        artifacts=(Artifact.from_path("mirror-plot-png", path, "image/png"),),
        metrics={"series_count": int(frame[series_column].nunique())},
        provenance=_provenance(cfg),
    )


def compute_mdmp(
    data: str | Path | Sequence[Mapping[str, Any]],
    output_dir: str | Path,
    *,
    time_column: str = "time_seconds",
    node_column: str = "roi",
    value_column: str = "value",
    config: AnalysisConfig | Mapping[str, Any] | None = None,
) -> AnalysisResult:
    cfg = normalize_config(config)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    np, pd, _ = _scientific()
    frame = pd.read_csv(data) if isinstance(data, (str, Path)) else pd.DataFrame(data)
    matrix = (
        frame.pivot_table(index=time_column, columns=node_column, values=value_column)
        .sort_index()
        .dropna(axis=0)
    )
    if matrix.shape[0] < 10 or matrix.shape[1] < 2:
        warning = "MDMP omitted: requires at least ten complete observations and two nodes"
        path = output / "mdmp.json"
        _write_json(path, {"schema": "eeg-result-v1", "warnings": [warning], "networks": []})
        return AnalysisResult(
            kind="mdmp",
            artifacts=(Artifact.from_path("mdmp-json", path, "application/json"),),
            warnings=(warning,),
            provenance=_provenance(cfg),
        )
    from mdmp import MDM

    np.random.seed(cfg.random_seed)
    model = MDM(
        matrix,
        method="hc",
        nbf=min(15, max(3, matrix.shape[0] // 4)),
        verbose=False,
        show_progress=False,
    )
    adjacency = np.asarray(model.adj_mat)
    nodes = [{"id": name, "label": name} for name in matrix.columns]
    edges = [
        {
            "source": str(matrix.columns[source]),
            "target": str(matrix.columns[target]),
            "directed": True,
        }
        for source, target in zip(*np.where(adjacency > 0))
        if source != target
    ]
    payload = {
        "schema": "eeg-result-v1",
        "nodes": nodes,
        "edges": edges,
        "adjacency": adjacency.tolist(),
        "sample_count": matrix.shape[0],
        "provenance": _provenance(cfg),
    }
    json_path = output / "mdmp.json"
    _write_json(json_path, payload)
    csv_path = output / "mdmp-adjacency.csv"
    pd.DataFrame(adjacency, index=matrix.columns, columns=matrix.columns).to_csv(csv_path)
    return AnalysisResult(
        kind="mdmp",
        artifacts=(
            Artifact.from_path("mdmp-json", json_path, "application/json"),
            Artifact.from_path("mdmp-adjacency-csv", csv_path, "text/csv"),
        ),
        metrics={"node_count": len(nodes), "edge_count": len(edges)},
        provenance=_provenance(cfg),
    )


def run_pipeline(
    input_path: str | Path,
    output_dir: str | Path,
    config: AnalysisConfig | Mapping[str, Any] | None = None,
    *,
    stages: Iterable[str] = ("preprocess", "power", "timeseries"),
) -> PipelineResult:
    cfg = normalize_config(config)
    root = Path(output_dir)
    root.mkdir(parents=True, exist_ok=True)
    requested = tuple(stages)
    results: list[AnalysisResult] = []
    warnings: list[str] = []
    source: str | Path = input_path
    if "preprocess" in requested:
        result = preprocess_recording(input_path, root / "preprocess", cfg)
        results.append(result)
        warnings.extend(result.warnings)
        source = next(
            artifact.path for artifact in result.artifacts if artifact.kind == "preprocessed-fif"
        )
    if "power" in requested:
        result = compute_band_power(source, root / "power", cfg)
        results.append(result)
        warnings.extend(result.warnings)
    if "timeseries" in requested:
        result = compute_timeseries_power(source, root / "timeseries", cfg)
        results.append(result)
        warnings.extend(result.warnings)
    manifest = root / "pipeline-result.json"
    pipeline = PipelineResult.create(
        results,
        warnings=list(dict.fromkeys(warnings)),
        extra_provenance={"input_sha256": _sha256(Path(input_path)), "stages": requested},
    )
    _write_json(manifest, pipeline.to_dict())
    return pipeline
