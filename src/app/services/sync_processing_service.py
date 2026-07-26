"""Evidence-based video/EEG synchronization algorithms.

Every method returns the same affine mapping:

    eeg_ms = video_ms * (1 + drift_ms_per_min / 60000) - offset_ms

Positive ``offset_ms`` therefore means the EEG acquisition started after the
video acquisition. Results never become official here; approval is a separate,
audited API action.
"""

from __future__ import annotations

from datetime import datetime
import math
from statistics import median
from typing import Any, Callable, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


ALGORITHM_VERSION = "sync-v1"
METHODS = (
    "absolute_timestamp",
    "hardware_trigger",
    "digital_marker",
    "visual_event",
    "audio_event",
    "reference_frame",
    "manual",
    "event_correlation",
    "informed_offset",
    "semi_automatic",
)

BAND_COLUMNS = {"delta", "theta", "alpha", "beta", "gamma"}
TIME_COLUMNS = {"timestamp_ms", "time", "timestamp"}


def _grade(uncertainty_ms: float | None) -> str:
    if uncertainty_ms is None or not math.isfinite(uncertainty_ms):
        return "insufficient"
    if uncertainty_ms <= 20:
        return "high"
    if uncertainty_ms <= 100:
        return "medium"
    return "low"


def insufficient(reason: str, missing_inputs: Iterable[str] = ()) -> dict[str, Any]:
    return {
        "outcome": "insufficient_evidence",
        "quality_grade": "insufficient",
        "uncertainty_ms": None,
        "result": {
            "mapping_version": "affine-v1",
            "offset_ms": None,
            "drift_ms_per_min": None,
            "anchors": [],
            "reason": reason,
            "missing_inputs": list(missing_inputs),
        },
        "metrics": {},
    }


def _proposal(
    *,
    offset_ms: float,
    drift_ms_per_min: float = 0.0,
    uncertainty_ms: float,
    anchors: list[dict[str, Any]],
    metrics: dict[str, Any],
    confidence: float | None = None,
) -> dict[str, Any]:
    result = {
        "mapping_version": "affine-v1",
        "equation": "eeg_ms = video_ms * (1 + drift_ms_per_min / 60000) - offset_ms",
        "offset_ms": round(float(offset_ms), 6),
        "drift_ms_per_min": round(float(drift_ms_per_min), 9),
        "uncertainty_ms": round(float(uncertainty_ms), 6),
        "anchors": anchors,
    }
    if confidence is not None:
        result["confidence"] = round(max(0.0, min(1.0, confidence)), 6)
    return {
        "outcome": "proposal",
        "quality_grade": _grade(uncertainty_ms),
        "uncertainty_ms": float(uncertainty_ms),
        "result": result,
        "metrics": metrics,
    }


def _normalise_anchor(value: dict[str, Any], index: int) -> dict[str, Any] | None:
    try:
        video_ms = float(value["video_time_ms"])
        eeg_ms = float(value["eeg_time_ms"])
    except (KeyError, TypeError, ValueError):
        return None
    if not math.isfinite(video_ms) or not math.isfinite(eeg_ms):
        return None
    return {
        "label": str(value.get("label") or f"anchor-{index + 1}"),
        "video_time_ms": video_ms,
        "eeg_time_ms": eeg_ms,
    }


def fit_affine_anchors(
    raw_anchors: Iterable[dict[str, Any]],
    *,
    precision_ms: float | None = None,
) -> dict[str, Any]:
    anchors = [
        anchor
        for index, value in enumerate(raw_anchors)
        if (anchor := _normalise_anchor(value, index)) is not None
    ]
    if not anchors:
        return insufficient("Nenhuma âncora temporal válida foi fornecida.", ["anchors"])

    precision = max(0.001, float(precision_ms or 0.0))
    if len(anchors) == 1:
        anchor = anchors[0]
        offset = anchor["video_time_ms"] - anchor["eeg_time_ms"]
        uncertainty = max(precision, float(anchor.get("uncertainty_ms") or precision or 100.0))
        if precision_ms is None:
            uncertainty = max(uncertainty, 100.0)
        return _proposal(
            offset_ms=offset,
            uncertainty_ms=uncertainty,
            anchors=anchors,
            metrics={
                "anchor_count": 1,
                "inlier_count": 1,
                "rejected_count": 0,
                "residual_rmse_ms": 0.0,
                "drift_estimable": False,
            },
        )

    points = sorted(
        [(a["video_time_ms"], a["eeg_time_ms"], a) for a in anchors],
        key=lambda item: item[0],
    )
    slopes: list[float] = []
    for i, (x1, y1, _) in enumerate(points):
        for x2, y2, _ in points[i + 1 :]:
            if x2 != x1:
                slopes.append((y2 - y1) / (x2 - x1))
    if not slopes:
        return insufficient("As âncoras usam o mesmo tempo de vídeo.", ["distinct_video_times"])

    threshold = max(precision * 3, 20.0)
    best: tuple[int, float, float, list[tuple[float, float, dict[str, Any]]]] | None = None
    for candidate_slope in slopes:
        candidate_intercept = median(
            [y - candidate_slope * x for x, y, _ in points]
        )
        candidate_inliers = [
            point
            for point in points
            if abs(point[1] - (candidate_slope * point[0] + candidate_intercept))
            <= threshold
        ]
        candidate_rmse = (
            math.sqrt(
                sum(
                    (
                        y - (candidate_slope * x + candidate_intercept)
                    )
                    ** 2
                    for x, y, _ in candidate_inliers
                )
                / len(candidate_inliers)
            )
            if candidate_inliers
            else float("inf")
        )
        score = (len(candidate_inliers), -candidate_rmse)
        if best is None or score > (best[0], -best[1]):
            best = (
                len(candidate_inliers),
                candidate_rmse,
                candidate_intercept,
                candidate_inliers,
            )
    inliers = best[3] if best else []
    if len(inliers) < 2:
        return insufficient("As âncoras são temporalmente inconsistentes.", ["consistent_anchor_pairs"])

    x_mean = sum(x for x, _, _ in inliers) / len(inliers)
    y_mean = sum(y for _, y, _ in inliers) / len(inliers)
    denominator = sum((x - x_mean) ** 2 for x, _, _ in inliers)
    slope = (
        sum((x - x_mean) * (y - y_mean) for x, y, _ in inliers) / denominator
        if denominator
        else 1.0
    )
    intercept = y_mean - slope * x_mean
    residuals = [y - (slope * x + intercept) for x, y, _ in inliers]
    rmse = math.sqrt(sum(r * r for r in residuals) / len(residuals))
    uncertainty = max(precision, rmse)
    offset = -intercept
    drift = (slope - 1.0) * 60000.0
    inlier_ids = {id(item[2]) for item in inliers}
    output_anchors = [
        {
            **anchor,
            "accepted": id(anchor) in inlier_ids,
            "residual_ms": round(
                anchor["eeg_time_ms"]
                - (slope * anchor["video_time_ms"] + intercept),
                6,
            ),
        }
        for anchor in anchors
    ]
    return _proposal(
        offset_ms=offset,
        drift_ms_per_min=drift,
        uncertainty_ms=uncertainty,
        anchors=output_anchors,
        metrics={
            "anchor_count": len(anchors),
            "inlier_count": len(inliers),
            "rejected_count": len(anchors) - len(inliers),
            "residual_rmse_ms": round(rmse, 6),
            "max_abs_residual_ms": round(max(abs(r) for r in residuals), 6),
            "drift_estimable": True,
        },
    )


def _parse_datetime(value: Any, timezone_name: str | None = None) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        if not timezone_name:
            return None
        try:
            parsed = parsed.replace(tzinfo=ZoneInfo(timezone_name))
        except ZoneInfoNotFoundError:
            return None
    return parsed


def process_absolute_timestamp(parameters: dict[str, Any], _: dict[str, Any]) -> dict[str, Any]:
    timezone_name = str(parameters.get("timezone") or "").strip() or None
    video_start = _parse_datetime(parameters.get("video_start"), timezone_name)
    eeg_start = _parse_datetime(parameters.get("eeg_start"), timezone_name)
    if not video_start or not eeg_start:
        return insufficient(
            "Timestamps absolutos precisam de timezone explícito.",
            ["video_start", "eeg_start", "timezone"],
        )
    offset = (eeg_start - video_start).total_seconds() * 1000.0
    video_precision = float(parameters.get("video_precision_ms") or 0)
    eeg_precision = float(parameters.get("eeg_precision_ms") or 0)
    uncertainty = math.hypot(video_precision, eeg_precision)
    if uncertainty <= 0:
        return insufficient(
            "A precisão dos relógios precisa ser informada.",
            ["video_precision_ms", "eeg_precision_ms"],
        )

    drift = 0.0
    anchors = [
        {"label": "início", "video_time_ms": 0.0, "eeg_time_ms": -offset}
    ]
    video_end = _parse_datetime(parameters.get("video_end"), timezone_name)
    eeg_end = _parse_datetime(parameters.get("eeg_end"), timezone_name)
    if bool(video_end) != bool(eeg_end):
        return insufficient(
            "Os timestamps finais devem ser fornecidos em par.",
            ["video_end", "eeg_end"],
        )
    if video_end and eeg_end:
        video_elapsed = (video_end - video_start).total_seconds() * 1000.0
        eeg_elapsed = (eeg_end - eeg_start).total_seconds() * 1000.0
        if video_elapsed <= 0 or eeg_elapsed <= 0:
            return insufficient("Intervalos absolutos inválidos.")
        slope = eeg_elapsed / video_elapsed
        drift = (slope - 1.0) * 60000.0
        anchors.append(
            {
                "label": "fim",
                "video_time_ms": video_elapsed,
                "eeg_time_ms": eeg_elapsed - offset,
            }
        )
    return _proposal(
        offset_ms=offset,
        drift_ms_per_min=drift,
        uncertainty_ms=uncertainty,
        anchors=anchors,
        metrics={
            "video_precision_ms": video_precision,
            "eeg_precision_ms": eeg_precision,
            "clock_source": parameters.get("source"),
            "drift_estimable": len(anchors) > 1,
        },
    )


def _event_list(source: Any) -> list[dict[str, Any]]:
    if not isinstance(source, list):
        return []
    result = []
    for index, item in enumerate(source):
        if isinstance(item, (int, float)):
            result.append({"time_ms": float(item), "code": str(index)})
            continue
        if not isinstance(item, dict):
            continue
        raw_time = item.get("time_ms", item.get("timestamp_ms"))
        try:
            time_ms = float(raw_time)
        except (TypeError, ValueError):
            continue
        result.append(
            {
                "time_ms": time_ms,
                "code": str(item.get("code", item.get("value", index))),
                "label": str(item.get("label") or item.get("code") or index),
            }
        )
    return result


def _collect(parameters: dict[str, Any], context: dict[str, Any], key: str) -> Any:
    if key in parameters:
        return parameters[key]
    if key in context:
        return context[key]
    for payload in context.get("evidence_payloads", []):
        if key in payload:
            return payload[key]
    return None


def _paired_event_fit(
    video_events: list[dict[str, Any]],
    eeg_events: list[dict[str, Any]],
    *,
    by_code: bool,
    precision_ms: float,
) -> dict[str, Any]:
    pairs: list[dict[str, Any]] = []
    if by_code:
        eeg_by_code: dict[str, list[dict[str, Any]]] = {}
        for event in eeg_events:
            eeg_by_code.setdefault(event["code"], []).append(event)
        for video_event in video_events:
            matches = eeg_by_code.get(video_event["code"], [])
            if matches:
                eeg_event = matches.pop(0)
                pairs.append(
                    {
                        "label": video_event.get("label") or video_event["code"],
                        "video_time_ms": video_event["time_ms"],
                        "eeg_time_ms": eeg_event["time_ms"],
                    }
                )
    else:
        for index, (video_event, eeg_event) in enumerate(zip(video_events, eeg_events)):
            pairs.append(
                {
                    "label": video_event.get("label") or f"event-{index + 1}",
                    "video_time_ms": video_event["time_ms"],
                    "eeg_time_ms": eeg_event["time_ms"],
                }
            )
    if len(pairs) < 2:
        return insufficient(
            "São necessários pelo menos dois eventos pareados.",
            ["video_events", "eeg_events"],
        )
    fitted = fit_affine_anchors(pairs, precision_ms=precision_ms)
    fitted["metrics"].update(
        {
            "video_event_count": len(video_events),
            "eeg_event_count": len(eeg_events),
            "matched_event_count": len(pairs),
        }
    )
    return fitted


def process_hardware_trigger(parameters: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    video_events = _event_list(_collect(parameters, context, "video_events"))
    eeg_events = _event_list(_collect(parameters, context, "eeg_events"))
    precision = float(parameters.get("precision_ms") or context.get("sample_period_ms") or 1.0)
    return _paired_event_fit(
        video_events,
        eeg_events,
        by_code=False,
        precision_ms=precision,
    )


def process_digital_marker(parameters: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    video_events = _event_list(_collect(parameters, context, "video_markers"))
    eeg_events = _event_list(_collect(parameters, context, "eeg_markers"))
    return _paired_event_fit(
        video_events,
        eeg_events,
        by_code=True,
        precision_ms=float(parameters.get("precision_ms") or 5.0),
    )


def process_visual_event(parameters: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    video_events = _event_list(_collect(parameters, context, "visual_peaks"))
    eeg_events = _event_list(_collect(parameters, context, "eeg_events"))
    frame_ms = float(parameters.get("frame_period_ms") or context.get("frame_period_ms") or 33.333)
    sample_ms = float(parameters.get("sample_period_ms") or context.get("sample_period_ms") or 1.0)
    result = _paired_event_fit(
        video_events,
        eeg_events,
        by_code=False,
        precision_ms=max(frame_ms, sample_ms),
    )
    result["metrics"]["roi"] = parameters.get("roi")
    result["metrics"]["detector"] = "opencv-luminance-peak"
    return result


def _normalised_cross_correlation(
    video: list[float],
    eeg: list[float],
    max_lag: int,
) -> tuple[int, float, int, float]:
    if len(video) < 3 or len(eeg) < 3:
        return 0, 0.0, 0, 0.0

    def normalise(values: list[float]) -> list[float]:
        mean = sum(values) / len(values)
        centered = [value - mean for value in values]
        norm = math.sqrt(sum(value * value for value in centered))
        return [value / norm for value in centered] if norm else []

    a = normalise(video)
    b = normalise(eeg)
    if not a or not b:
        return 0, 0.0, 0, 0.0
    candidates: list[tuple[float, int]] = []
    for lag in range(-max_lag, max_lag + 1):
        products = [a[i] * b[i + lag] for i in range(len(a)) if 0 <= i + lag < len(b)]
        if len(products) < min(len(a), len(b)) * 0.3:
            continue
        candidates.append((sum(products), lag))
    if not candidates:
        return 0, 0.0, 0, 0.0
    candidates.sort(reverse=True)
    best_corr, best_lag = candidates[0]
    second_corr = candidates[1][0] if len(candidates) > 1 else 0.0
    half_height = best_corr * 0.5
    peak_width = sum(1 for corr, _ in candidates if corr >= half_height)
    return best_lag, best_corr, peak_width, best_corr - second_corr


def _resample_envelope(values: list[float], source_rate: float, bin_ms: float) -> list[float]:
    if source_rate <= 0 or not values:
        return []
    samples_per_bin = max(1, int(round(source_rate * bin_ms / 1000.0)))
    envelope = []
    for start in range(0, len(values), samples_per_bin):
        chunk = values[start : start + samples_per_bin]
        if chunk:
            envelope.append(math.sqrt(sum(value * value for value in chunk) / len(chunk)))
    return envelope


def process_audio_event(parameters: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    video_signal = _collect(parameters, context, "video_audio")
    eeg_signal = _collect(parameters, context, "eeg_audio")
    if not isinstance(video_signal, list) or not isinstance(eeg_signal, list):
        return insufficient(
            "Áudio de referência não está disponível nas duas fontes.",
            ["video_audio", "eeg_audio"],
        )
    video_rate = float(_collect(parameters, context, "video_audio_rate_hz") or 0)
    eeg_rate = float(_collect(parameters, context, "eeg_audio_rate_hz") or 0)
    bin_ms = float(parameters.get("bin_ms") or 10.0)
    video_env = _resample_envelope([float(v) for v in video_signal], video_rate, bin_ms)
    eeg_env = _resample_envelope([float(v) for v in eeg_signal], eeg_rate, bin_ms)
    max_lag_ms = float(parameters.get("max_lag_ms") or 30000.0)
    lag, corr, peak_width, separation = _normalised_cross_correlation(
        video_env,
        eeg_env,
        int(max_lag_ms / bin_ms),
    )
    if corr <= 0 or separation <= 0.001:
        return insufficient("A correlação de áudio não possui um pico estável.")
    uncertainty = max(bin_ms, peak_width * bin_ms / 2.0)
    return _proposal(
        offset_ms=-lag * bin_ms,
        uncertainty_ms=uncertainty,
        anchors=[],
        confidence=max(0.0, min(1.0, corr)),
        metrics={
            "detector": "audio-envelope-cross-correlation",
            "bin_ms": bin_ms,
            "peak_correlation": corr,
            "peak_separation": separation,
            "peak_width_bins": peak_width,
        },
    )


def process_reference_frame(parameters: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    anchors = _collect(parameters, context, "anchors") or []
    fps = float(parameters.get("fps") or context.get("fps") or 0)
    converted = []
    for index, anchor in enumerate(anchors):
        item = dict(anchor)
        if "video_time_ms" not in item and item.get("video_frame") is not None and fps > 0:
            item["video_time_ms"] = float(item["video_frame"]) * 1000.0 / fps
        if "eeg_time_ms" not in item and item.get("eeg_sample") is not None:
            rate = float(parameters.get("sample_rate_hz") or context.get("sample_rate_hz") or 0)
            if rate > 0:
                item["eeg_time_ms"] = float(item["eeg_sample"]) * 1000.0 / rate
        item.setdefault("label", f"reference-{index + 1}")
        converted.append(item)
    precision = max(
        1000.0 / fps if fps > 0 else 0,
        1000.0 / float(context.get("sample_rate_hz") or 1),
    )
    return fit_affine_anchors(converted, precision_ms=precision)


def process_manual(parameters: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    anchors = _collect(parameters, context, "anchors") or []
    precision = parameters.get("uncertainty_ms")
    return fit_affine_anchors(anchors, precision_ms=float(precision) if precision else None)


def _event_envelopes(
    facial_events: list[dict[str, Any]],
    eeg_rows: list[dict[str, Any]],
    bin_ms: float,
) -> tuple[list[float], list[float]]:
    timestamps = [
        float(row["timestamp_ms"])
        for row in eeg_rows
        if isinstance(row.get("timestamp_ms"), (int, float))
    ]
    if len(timestamps) < 3:
        return [], []
    start = min(0.0, min(timestamps))
    end = max(timestamps)
    n_bins = max(1, int((end - start) / bin_ms) + 1)
    video_env = [0.0] * n_bins
    for event in facial_events:
        raw_time = event.get("start_time")
        if not isinstance(raw_time, (int, float)):
            continue
        index = int((float(raw_time) * 1000.0 - start) / bin_ms)
        if 0 <= index < n_bins:
            video_env[index] += float(event.get("confidence_mean") or 1.0)

    numeric_columns = [
        key
        for key, value in eeg_rows[0].items()
        if key not in TIME_COLUMNS and isinstance(value, (int, float))
    ]
    if not numeric_columns:
        return [], []
    samples: list[tuple[float, float]] = []
    previous: dict[str, float] = {}
    for row in eeg_rows:
        timestamp = row.get("timestamp_ms")
        if not isinstance(timestamp, (int, float)):
            continue
        changes = []
        for column in numeric_columns:
            value = row.get(column)
            if not isinstance(value, (int, float)):
                continue
            current = float(value)
            if column in previous:
                changes.append(abs(current - previous[column]))
            previous[column] = current
        if changes:
            samples.append((float(timestamp), median(changes)))
    if len(samples) < 3:
        return [], []
    center = median(value for _, value in samples)
    mad = median(abs(value - center) for _, value in samples)
    if mad <= 1e-12:
        nonzero = [abs(value - center) for _, value in samples if abs(value - center) > 1e-12]
        if not nonzero:
            return [], []
        mad = median(nonzero)
    eeg_env = [0.0] * n_bins
    counts = [0] * n_bins
    for timestamp, value in samples:
        index = int((timestamp - start) / bin_ms)
        if 0 <= index < n_bins:
            eeg_env[index] += abs(value - center) / mad
            counts[index] += 1
    eeg_env = [
        eeg_env[index] / counts[index] if counts[index] else 0.0
        for index in range(n_bins)
    ]
    return video_env, eeg_env


def process_event_correlation(parameters: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    events = _collect(parameters, context, "facial_events")
    rows = _collect(parameters, context, "eeg_rows")
    if not isinstance(events, list) or not isinstance(rows, list):
        return insufficient(
            "Eventos faciais e série EEG são obrigatórios.",
            ["facial_events", "eeg_rows"],
        )
    bin_ms = float(parameters.get("bin_ms") or 250.0)
    video_env, eeg_env = _event_envelopes(events, rows, bin_ms)
    if not video_env or not eeg_env or sum(video_env) <= 0 or sum(eeg_env) <= 0:
        return insufficient(
            "Sinal insuficiente: faltam eventos faciais ou variação temporal no EEG."
        )
    max_lag_ms = float(parameters.get("max_lag_ms") or 30000.0)
    lag, corr, peak_width, separation = _normalised_cross_correlation(
        video_env,
        eeg_env,
        int(max_lag_ms / bin_ms),
    )
    if corr <= 0 or separation <= 0.001:
        return insufficient("A correlação de eventos não possui um pico estável.")
    uncertainty = max(bin_ms, peak_width * bin_ms / 2.0)
    return _proposal(
        offset_ms=-lag * bin_ms,
        uncertainty_ms=uncertainty,
        anchors=[],
        confidence=max(0.0, min(1.0, corr)),
        metrics={
            "detector": "event-density-vs-robust-eeg-activity",
            "bin_ms": bin_ms,
            "facial_event_count": len(events),
            "eeg_sample_count": len(rows),
            "peak_correlation": corr,
            "peak_separation": separation,
            "peak_width_bins": peak_width,
        },
    )


def process_informed_offset(parameters: dict[str, Any], _: dict[str, Any]) -> dict[str, Any]:
    try:
        value = float(parameters["offset"])
        uncertainty = float(parameters["uncertainty_ms"])
    except (KeyError, TypeError, ValueError):
        return insufficient(
            "Offset e incerteza precisam ser informados.",
            ["offset", "uncertainty_ms"],
        )
    unit = str(parameters.get("unit") or "ms").lower()
    factors = {"ms": 1.0, "s": 1000.0, "us": 0.001, "µs": 0.001}
    if unit not in factors:
        return insufficient("Unidade de offset inválida.", ["unit"])
    if not str(parameters.get("source") or "").strip() or not str(
        parameters.get("justification") or ""
    ).strip():
        return insufficient(
            "A fonte e a justificativa do offset são obrigatórias.",
            ["source", "justification"],
        )
    return _proposal(
        offset_ms=value * factors[unit],
        uncertainty_ms=abs(uncertainty),
        anchors=[],
        metrics={
            "source": parameters["source"],
            "justification": parameters["justification"],
            "input_unit": unit,
        },
    )


def process_semi_automatic(parameters: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    base = parameters.get("base_result") or context.get("base_result")
    anchors = _collect(parameters, context, "anchors") or []
    if not isinstance(base, dict) or base.get("offset_ms") is None:
        return insufficient("Uma proposta automática válida é obrigatória.", ["base_result"])
    if not anchors:
        return insufficient("Ao menos uma âncora de revisão é obrigatória.", ["anchors"])
    duration = float(parameters.get("duration_ms") or context.get("duration_ms") or 0)
    drift = float(base.get("drift_ms_per_min") or 0)
    slope = 1.0 + drift / 60000.0
    offset = float(base["offset_ms"])
    base_anchors = [
        {"label": "base-início", "video_time_ms": 0.0, "eeg_time_ms": -offset}
    ]
    if duration > 0:
        base_anchors.append(
            {
                "label": "base-fim",
                "video_time_ms": duration,
                "eeg_time_ms": slope * duration - offset,
            }
        )
    result = fit_affine_anchors(
        [*base_anchors, *anchors],
        precision_ms=float(parameters.get("uncertainty_ms") or base.get("uncertainty_ms") or 100),
    )
    result["metrics"]["base_offset_ms"] = offset
    result["metrics"]["base_drift_ms_per_min"] = drift
    result["metrics"]["review_anchor_count"] = len(anchors)
    return result


PROCESSORS: dict[str, Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]] = {
    "absolute_timestamp": process_absolute_timestamp,
    "hardware_trigger": process_hardware_trigger,
    "digital_marker": process_digital_marker,
    "visual_event": process_visual_event,
    "audio_event": process_audio_event,
    "reference_frame": process_reference_frame,
    "manual": process_manual,
    "event_correlation": process_event_correlation,
    "informed_offset": process_informed_offset,
    "semi_automatic": process_semi_automatic,
}


def process_sync(
    method: str,
    parameters: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    processor = PROCESSORS.get(method)
    if processor is None:
        return insufficient(f"Método de sincronização desconhecido: {method}")
    output = processor(parameters or {}, context or {})
    output["method"] = method
    output["algorithm_version"] = ALGORITHM_VERSION
    return output
