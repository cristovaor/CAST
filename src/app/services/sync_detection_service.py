"""Automatic video↔EEG synchronization detection (docs §11, method:
`event_correlation`).

Without a hardware trigger channel, the platform proposes an offset via
cross-correlation between two activity envelopes built at a common time
resolution:

    - video activity: density of detected facial events over time
    - EEG activity:   proportion of artifact-range samples over time
      (a coarse proxy for bursts of movement/activity in the signal)

The lag that maximizes normalized cross-correlation is the proposed EEG offset
relative to the video. Confidence is the correlation peak itself (0..1) — a
low peak means the two envelopes don't line up well and the researcher should
prefer a manual or marker-based method instead. This is explicitly a
PROPOSAL: it always lands in `auto_available`, never auto-approved.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

BIN_MS = 1000  # 1-second resolution envelopes
MAX_LAG_S = 30  # search window: ±30s


def _facial_activity_envelope(events: List[Dict[str, Any]], duration_ms: float) -> List[float]:
    n_bins = max(1, int(duration_ms // BIN_MS) + 1)
    envelope = [0.0] * n_bins
    for ev in events:
        start = ev.get("start_time", 0) * 1000
        end = ev.get("end_time", 0) * 1000
        b0 = max(0, int(start // BIN_MS))
        b1 = min(n_bins - 1, int(end // BIN_MS))
        for b in range(b0, b1 + 1):
            envelope[b] += 1.0
    return envelope


def _eeg_activity_envelope(rows: List[Dict[str, Any]], threshold: float = 150.0) -> Tuple[List[float], float]:
    """Bins the fraction of channel samples exceeding `threshold` per second.
    Returns (envelope, start_timestamp_ms)."""
    if not rows:
        return [], 0.0
    channel_cols = [
        k for k, v in rows[0].items()
        if k not in ("timestamp_ms", "time", "timestamp") and isinstance(v, (int, float))
    ]
    start_ms = rows[0].get("timestamp_ms", 0) or 0
    end_ms = rows[-1].get("timestamp_ms", start_ms) or start_ms
    n_bins = max(1, int((end_ms - start_ms) // BIN_MS) + 1)
    sums = [0.0] * n_bins
    counts = [0] * n_bins

    for row in rows:
        ts = row.get("timestamp_ms")
        if not isinstance(ts, (int, float)):
            continue
        b = int((ts - start_ms) // BIN_MS)
        if b < 0 or b >= n_bins:
            continue
        vals = [row[c] for c in channel_cols if isinstance(row.get(c), (int, float))]
        if not vals:
            continue
        over = sum(1 for v in vals if abs(v) > threshold) / len(vals)
        sums[b] += over
        counts[b] += 1

    envelope = [sums[i] / counts[i] if counts[i] else 0.0 for i in range(n_bins)]
    return envelope, float(start_ms)


def _normalized_cross_correlation(a: List[float], b: List[float], max_lag_bins: int) -> Tuple[int, float]:
    """Returns (best_lag_bins, peak_correlation in 0..1). Positive lag means
    `b` (EEG) lags behind `a` (video) — i.e. EEG events happen later."""
    n, m = len(a), len(b)
    if n < 2 or m < 2:
        return 0, 0.0

    def _normalize(x: List[float]) -> List[float]:
        mean = sum(x) / len(x)
        centered = [v - mean for v in x]
        norm = sum(v * v for v in centered) ** 0.5
        return [v / norm for v in centered] if norm > 0 else centered

    an, bn = _normalize(a), _normalize(b)

    best_lag, best_corr = 0, -1.0
    for lag in range(-max_lag_bins, max_lag_bins + 1):
        acc = 0.0
        count = 0
        for i in range(n):
            j = i + lag
            if 0 <= j < m:
                acc += an[i] * bn[j]
                count += 1
        if count < min(n, m) * 0.3:  # require meaningful overlap
            continue
        corr = acc  # already normalized (unit-variance dot product ≈ correlation)
        if corr > best_corr:
            best_corr, best_lag = corr, lag

    confidence = max(0.0, min(1.0, (best_corr + 1) / 2))  # map [-1,1] → [0,1]
    return best_lag, confidence


def propose_sync(
    facial_events: List[Dict[str, Any]],
    eeg_rows: List[Dict[str, Any]],
    video_duration_ms: float,
) -> Dict[str, Any]:
    """Proposes an offset_ms + confidence via cross-correlation of activity
    envelopes. Always a PROPOSAL — the researcher must review and approve."""
    video_env = _facial_activity_envelope(facial_events, video_duration_ms)
    eeg_env, eeg_start_ms = _eeg_activity_envelope(eeg_rows)

    if not video_env or not eeg_env or sum(video_env) == 0 or sum(eeg_env) == 0:
        return {
            "offset_ms": 0,
            "confidence": 0.0,
            "method": "event_correlation",
            "note": "Sinal insuficiente para correlação automática (poucos eventos faciais ou EEG sem variação).",
        }

    max_lag_bins = int(MAX_LAG_S * 1000 / BIN_MS)
    lag_bins, confidence = _normalized_cross_correlation(video_env, eeg_env, max_lag_bins)
    offset_ms = int(lag_bins * BIN_MS)

    return {
        "offset_ms": offset_ms,
        "confidence": round(confidence, 3),
        "method": "event_correlation",
        "video_bins": len(video_env),
        "eeg_bins": len(eeg_env),
        "note": (
            "Offset estimado por correlação cruzada entre densidade de eventos faciais "
            "e atividade do EEG. Requer revisão do pesquisador antes de aprovar."
        ),
    }
