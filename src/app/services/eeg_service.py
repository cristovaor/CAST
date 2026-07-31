"""EEG parsing & quality service.

Extracts real metadata (format, device, channels, montage, sampling rate,
duration) and per-channel quality from an EEG recording. Uses MNE-Python when
available (EDF/EDF+/BDF/BrainVision/FIF/EEGLAB), with a native CSV fallback so
the pipeline still runs in a minimal environment.

Quality is never reduced to a single opaque score (docs §10): the report keeps
per-channel valid ratios, flat/noisy detection, the overall valid percentage,
the criteria used and structured findings (problem/evidence/impact/action).
"""
from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Amplitude beyond this (in the recording's units) counts as an artefact sample.
ARTIFACT_ABS_THRESHOLD = 150.0
# A channel whose values collapse to (near) a single value is "flat".
FLAT_DISTINCT_MIN = 2
# Below this valid ratio a channel is flagged "noisy".
NOISY_VALID_RATIO = 0.6

FORMAT_BY_EXT = {
    ".edf": "EDF", ".bdf": "BDF", ".vhdr": "BrainVision", ".fif": "FIF",
    ".set": "EEGLAB", ".csv": "CSV", ".txt": "CSV",
}

QUALITY_CRITERIA = [
    f"|amplitude| > {ARTIFACT_ABS_THRESHOLD:.0f} = artefato",
    f"< {FLAT_DISTINCT_MIN} valores distintos = canal plano",
    f"razão de amostras válidas < {NOISY_VALID_RATIO:.0%} = canal ruidoso",
]

# Columns that are not EEG channels in a CSV layout.
_NON_CHANNEL = {"timestamp_ms", "time", "timestamp", "index"}


def format_from_filename(filename: Optional[str]) -> str:
    if not filename:
        return "CSV"
    lower = filename.lower()
    for ext, fmt in FORMAT_BY_EXT.items():
        if lower.endswith(ext):
            return fmt
    return "proprietary"


def _try_mne(data: bytes, filename: str) -> Optional[Dict[str, Any]]:
    """Parses with MNE if installed and the format is supported. Returns None
    to signal the caller should fall back to CSV parsing."""
    try:
        import mne  # type: ignore
    except Exception:
        return None

    import tempfile
    import os

    lower = filename.lower()
    suffix = next((ext for ext in FORMAT_BY_EXT if lower.endswith(ext)), None)
    if suffix in (None, ".csv", ".txt"):
        return None  # let the CSV path handle these

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        mne.set_log_level("ERROR")
        if suffix in (".edf", ".bdf"):
            raw = mne.io.read_raw_edf(tmp_path, preload=True) if suffix == ".edf" \
                else mne.io.read_raw_bdf(tmp_path, preload=True)
        elif suffix == ".vhdr":
            raw = mne.io.read_raw_brainvision(tmp_path, preload=True)
        elif suffix == ".fif":
            raw = mne.io.read_raw_fif(tmp_path, preload=True)
        elif suffix == ".set":
            raw = mne.io.read_raw_eeglab(tmp_path, preload=True)
        else:
            return None

        signals = raw.get_data()  # shape (n_channels, n_samples), in volts
        ch_names = list(raw.ch_names)
        sfreq = float(raw.info["sfreq"])
        # MNE returns volts; convert to microvolts to match the threshold scale.
        signals_uv = signals * 1e6

        channel_quality, findings, valid_ratios = _assess_channels(
            {name: signals_uv[i].tolist() for i, name in enumerate(ch_names)}
        )
        verdict = _verdict(valid_ratios, findings)

        return {
            "eeg_format": format_from_filename(filename),
            "device": None,
            "channel_count": len(ch_names),
            "channel_names": ch_names,
            "sample_rate_hz": sfreq,
            "duration_seconds": float(raw.n_times) / sfreq if sfreq else None,
            "units": "µV",
            "event_count": len(raw.annotations) if raw.annotations else 0,
            "valid_ratio": round(sum(valid_ratios) / len(valid_ratios), 3) if valid_ratios else 0.0,
            "channel_quality": channel_quality,
            "quality_findings": findings,
            "quality_criteria": QUALITY_CRITERIA,
            "quality_verdict": verdict,
            "parser": "mne",
        }
    except Exception:
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def _parse_csv(data: bytes) -> Dict[str, Any]:
    """Native CSV fallback: numeric columns (minus time) are channels/bands."""
    text = data.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows: List[Dict[str, Any]] = []
    for row in reader:
        parsed: Dict[str, Any] = {}
        for k, v in row.items():
            if k is None:
                continue
            try:
                parsed[k] = float(v)
            except (ValueError, TypeError):
                parsed[k] = v
        rows.append(parsed)

    channel_cols = [
        k for k, v in (rows[0].items() if rows else [])
        if k not in _NON_CHANNEL and isinstance(v, (int, float))
    ]
    by_channel = {c: [r[c] for r in rows if isinstance(r.get(c), (int, float))] for c in channel_cols}
    channel_quality, findings, valid_ratios = _assess_channels(by_channel)
    verdict = _verdict(valid_ratios, findings)

    # Estimate sampling rate from timestamp_ms if present.
    sample_rate = None
    duration_seconds = None
    ts = [r.get("timestamp_ms") for r in rows if isinstance(r.get("timestamp_ms"), (int, float))]
    if len(ts) >= 2:
        span_ms = ts[-1] - ts[0]
        if span_ms > 0:
            sample_rate = round((len(ts) - 1) / (span_ms / 1000.0), 2)
            duration_seconds = round(span_ms / 1000.0, 2)

    return {
        "eeg_format": "CSV",
        "channel_count": len(channel_cols),
        "channel_names": channel_cols,
        "sample_rate_hz": sample_rate,
        "duration_seconds": duration_seconds,
        "units": "µV",
        "event_count": 0,
        "valid_ratio": round(sum(valid_ratios) / len(valid_ratios), 3) if valid_ratios else 0.0,
        "channel_quality": channel_quality,
        "quality_findings": findings,
        "quality_criteria": QUALITY_CRITERIA,
        "quality_verdict": verdict,
        "parser": "csv",
    }


def _assess_channels(
    by_channel: Dict[str, List[float]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[float]]:
    """Per-channel quality (docs §10): valid ratio, flat/noisy status, findings."""
    channel_quality: List[Dict[str, Any]] = []
    findings: List[Dict[str, Any]] = []
    valid_ratios: List[float] = []

    for name, values in by_channel.items():
        total = len(values) or 1
        valid = sum(1 for x in values if abs(x) <= ARTIFACT_ABS_THRESHOLD)
        vr = valid / total
        distinct = len({round(x, 6) for x in values})
        status = "good"
        if distinct < FLAT_DISTINCT_MIN:
            status = "flat"
        elif vr < NOISY_VALID_RATIO:
            status = "noisy"

        valid_ratios.append(vr)
        channel_quality.append({
            "name": name, "status": status, "valid_ratio": round(vr, 3),
            "impedance_kohm": None, "notes": None,
        })

        if status == "flat":
            findings.append({
                "id": f"ef-{name}", "issue": f"Canal plano ({name})",
                "evidence": "Variância ~0 ao longo do registro.",
                "impact": "Canal inutilizável; afeta análises espaciais e topografia.",
                "recommendation": "Excluir ou interpolar a partir de vizinhos, registrando a decisão.",
                "reprocessable": True, "tone": "danger",
            })
        elif status == "noisy":
            findings.append({
                "id": f"ef-{name}", "issue": f"Canal ruidoso ({name})",
                "evidence": f"Apenas {round(vr * 100)}% de amostras dentro do limiar de amplitude.",
                "impact": "Reduz a confiabilidade das features desse canal.",
                "recommendation": "Revisar filtragem/impedância antes de incluir.",
                "reprocessable": True, "tone": "warning",
            })

    return channel_quality, findings, valid_ratios


def _verdict(valid_ratios: List[float], findings: List[Dict[str, Any]]) -> str:
    """Overall verdict from channel valid ratios + findings (never a bare score)."""
    overall = sum(valid_ratios) / len(valid_ratios) if valid_ratios else 0.0
    has_danger = any(f["tone"] == "danger" for f in findings)
    if has_danger:
        return "review_required"
    if overall >= 0.9 and not findings:
        return "approved"
    if overall >= 0.8:
        return "approved_with_caveats"
    return "review_required"


def parse_eeg(data: bytes, filename: str) -> Dict[str, Any]:
    """Parses EEG bytes into metadata + per-channel quality.

    Tries MNE for scientific formats; falls back to CSV parsing. Always returns
    a dict of fields to persist on the EEGAsset.
    """
    result = _try_mne(data, filename)
    if result is not None:
        return result
    return _parse_csv(data)


def parse_eeg_path(path: str | Path) -> Dict[str, Any]:
    """Parse a staged EEG while preserving BrainVision/EEGLAB companions."""
    source = Path(path)
    suffix = source.suffix.lower()
    if suffix in {".csv", ".txt"}:
        return _parse_csv(source.read_bytes())
    if suffix not in FORMAT_BY_EXT:
        raise ValueError(f"unsupported EEG format: {suffix or '<none>'}")
    try:
        import mne  # type: ignore
    except Exception as exc:
        raise RuntimeError("MNE is required to parse this EEG format") from exc

    mne.set_log_level("ERROR")
    if suffix == ".edf":
        raw = mne.io.read_raw_edf(source, preload=True)
    elif suffix == ".bdf":
        raw = mne.io.read_raw_bdf(source, preload=True)
    elif suffix == ".vhdr":
        raw = mne.io.read_raw_brainvision(source, preload=True)
    elif suffix == ".fif":
        raw = mne.io.read_raw_fif(source, preload=True)
    elif suffix == ".set":
        raw = mne.io.read_raw_eeglab(source, preload=True)
    else:
        raise ValueError(f"unsupported EEG format: {suffix}")

    signals_uv = raw.get_data() * 1e6
    channel_names = list(raw.ch_names)
    sampling_rate = float(raw.info["sfreq"])
    channel_quality, findings, valid_ratios = _assess_channels(
        {
            name: signals_uv[index].tolist()
            for index, name in enumerate(channel_names)
        }
    )
    return {
        "eeg_format": format_from_filename(source.name),
        "device": None,
        "channel_count": len(channel_names),
        "channel_names": channel_names,
        "sample_rate_hz": sampling_rate,
        "duration_seconds": float(raw.n_times) / sampling_rate
        if sampling_rate
        else None,
        "units": "µV",
        "event_count": len(raw.annotations) if raw.annotations else 0,
        "valid_ratio": round(sum(valid_ratios) / len(valid_ratios), 3)
        if valid_ratios
        else 0.0,
        "channel_quality": channel_quality,
        "quality_findings": findings,
        "quality_criteria": QUALITY_CRITERIA,
        "quality_verdict": _verdict(valid_ratios, findings),
        "parser": "mne",
    }
