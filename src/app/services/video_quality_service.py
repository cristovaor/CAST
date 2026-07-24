"""Video quality assessment (docs §9).

Derives a verdict + structured findings from real signals produced during
processing (face detection rate, dropped/invalid frames) — never a bare score
without explanation.
"""
from __future__ import annotations

from typing import Any, Dict, List


def assess_video_quality(
    detection_rate: float,
    n_frames: int,
    fps: float | None = None,
    invalid_frames: int | None = None,
) -> Dict[str, Any]:
    findings: List[Dict[str, Any]] = []

    if detection_rate < 0.5:
        tone = "danger"
    elif detection_rate < 0.8:
        tone = "warning"
    else:
        tone = None

    if tone:
        findings.append({
            "id": "vf-face-detection",
            "issue": "Taxa de detecção facial reduzida",
            "evidence": f"Face detectada em {detection_rate:.1%} dos frames analisados ({n_frames} frames).",
            "impact": "Reduz a confiabilidade de landmarks e features derivadas nos trechos afetados.",
            "recommendation": "Revisar enquadramento/iluminação ou marcar os trechos como não avaliáveis.",
            "reprocessable": True,
            "tone": tone,
        })

    if invalid_frames and n_frames:
        invalid_ratio = invalid_frames / n_frames
        if invalid_ratio > 0.02:
            findings.append({
                "id": "vf-invalid-frames",
                "issue": "Frames inválidos acima do esperado",
                "evidence": f"{invalid_frames} de {n_frames} frames ({invalid_ratio:.1%}) inválidos.",
                "impact": "Pode indicar queda de frames ou corrupção parcial do arquivo.",
                "recommendation": "Reprocessar com verificação de integridade do vídeo.",
                "reprocessable": True,
                "tone": "warning",
            })

    if detection_rate < 0.5:
        verdict = "rejected"
    elif detection_rate < 0.7 or any(f["tone"] == "warning" for f in findings):
        verdict = "review_required" if detection_rate < 0.7 else "approved_with_caveats"
    elif findings:
        verdict = "approved_with_caveats"
    else:
        verdict = "approved"

    return {
        "verdict": verdict,
        "faceDetectionRate": round(detection_rate, 4),
        "validFrameRatio": round(1 - ((invalid_frames or 0) / n_frames), 4) if n_frames else None,
        "totalFrames": n_frames,
        "fps": fps,
        "findings": findings,
        "criteria": [
            "detecção facial < 50% = rejeitado",
            "detecção facial < 70% = requer revisão",
            "frames inválidos > 2% = ressalva",
        ],
    }
