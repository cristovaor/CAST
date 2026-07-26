"""Reproducible scientific report assembly and statistical analysis.

The service deliberately separates descriptive summaries from inferential
models. It never turns an observational association into a causal statement
and never invents values for unavailable modalities.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import hashlib
from importlib.metadata import PackageNotFoundError, version
import json
import math
from typing import Any
from uuid import UUID

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import (
    AssessmentType,
    ConsentStatus,
    Participant,
    Prediction,
    ResearchVariable,
    Study,
    StudyGroup,
)

try:  # The API can still expose descriptive previews during rolling deploys.
    from scipy import stats
except ImportError:  # pragma: no cover - dependency is installed in production
    stats = None

try:
    import statsmodels.api as sm
    import statsmodels.formula.api as smf
except ImportError:  # pragma: no cover
    sm = None
    smf = None


METHODOLOGY_VERSION = "cast-scientific-v1"
BUILTIN_OUTCOMES = {
    "assessment.pre_score": {
        "label": "Escore pré",
        "unit": "pontos",
        "kind": "numeric",
    },
    "assessment.post_score": {
        "label": "Escore pós",
        "unit": "pontos",
        "kind": "numeric",
    },
    "assessment.change": {
        "label": "Mudança pós - pré",
        "unit": "pontos",
        "kind": "numeric",
    },
    "session.duration_seconds": {
        "label": "Duração da sessão",
        "unit": "s",
        "kind": "numeric",
    },
    "video.valid_frame_ratio": {
        "label": "Proporção de quadros válidos",
        "unit": "proporção",
        "kind": "numeric",
    },
    "eeg.valid_ratio": {
        "label": "Proporção válida do EEG",
        "unit": "proporção",
        "kind": "numeric",
    },
}

TEMPLATE_DEFINITIONS = [
    {
        "key": "study_overview",
        "title": "Relatório do estudo",
        "scope": "study",
        "description": "Protocolo, fluxo amostral, qualidade, dados ausentes e desfechos.",
    },
    {
        "key": "individual_longitudinal",
        "title": "Relatório individual longitudinal",
        "scope": "individual",
        "description": "Trajetória por sessão e condição, sem inferência populacional para n=1.",
    },
    {
        "key": "control_group_comparison",
        "title": "Comparação com grupo controle",
        "scope": "group",
        "description": "Comparabilidade inicial, efeitos, intervalos e análises de sensibilidade.",
    },
]


def _float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _prediction_actions(summary: dict | None) -> dict[str, dict]:
    if not summary:
        return {}
    actions = summary.get("actions")
    if isinstance(actions, dict):
        return actions
    return {
        key: value
        for key, value in summary.items()
        if isinstance(value, dict) and ("count" in value or "per_minute" in value)
    }


def _collect_rows(study: Study, db: Session) -> tuple[pd.DataFrame, dict[str, dict]]:
    prediction_map: dict[str, list[Prediction]] = defaultdict(list)
    video_ids = [
        session.video_asset.id
        for participant in study.participants
        for session in participant.sessions
        if session.video_asset is not None
    ]
    if video_ids:
        for prediction in (
            db.query(Prediction)
            .filter(Prediction.video_asset_id.in_(video_ids))
            .all()
        ):
            prediction_map[str(prediction.video_asset_id)].append(prediction)

    rows: list[dict[str, Any]] = []
    dynamic_outcomes: dict[str, dict] = {}
    for participant in study.participants:
        if (
            participant.consent_status != ConsentStatus.accepted
            or not getattr(participant, "is_active", True)
        ):
            continue
        for session_index, session in enumerate(
            sorted(
                participant.sessions,
                key=lambda item: (
                    item.recorded_at or item.created_at,
                    str(item.id),
                ),
            ),
            start=1,
        ):
            pre = next(
                (
                    item
                    for item in session.assessments
                    if item.type == AssessmentType.pre_test
                ),
                None,
            )
            post = next(
                (
                    item
                    for item in session.assessments
                    if item.type == AssessmentType.post_test
                ),
                None,
            )
            pre_score = _float(pre.score) if pre else None
            post_score = _float(post.score) if post else None
            row: dict[str, Any] = {
                "participant_id": str(participant.id),
                "participant_code": participant.external_code,
                "group_id": str(participant.group_id) if participant.group_id else None,
                "group_code": participant.group.code if participant.group else None,
                "group_name": participant.group.name if participant.group else None,
                "group_role": participant.group.role if participant.group else None,
                "session_id": str(session.id),
                "session_index": session_index,
                "condition": session.condition,
                "recorded_at": (
                    session.recorded_at or session.created_at
                ).isoformat(),
                "assessment.pre_score": pre_score,
                "assessment.post_score": post_score,
                "assessment.change": (
                    post_score - pre_score
                    if pre_score is not None and post_score is not None
                    else None
                ),
                "session.duration_seconds": _float(session.duration_seconds),
                "video.valid_frame_ratio": None,
                "eeg.valid_ratio": (
                    _float(session.eeg_asset.valid_ratio)
                    if session.eeg_asset is not None
                    else None
                ),
            }
            if session.video_asset is not None:
                quality = session.video_asset.quality_report or {}
                row["video.valid_frame_ratio"] = _float(
                    quality.get("valid_frame_ratio")
                    or quality.get("face_detection_rate")
                )
                for prediction in prediction_map.get(
                    str(session.video_asset.id), []
                ):
                    for action, metrics in _prediction_actions(
                        prediction.summary
                    ).items():
                        for suffix, unit in (
                            ("count", "eventos"),
                            ("per_minute", "eventos/min"),
                        ):
                            key = f"prediction.{action}.{suffix}"
                            row[key] = _float(metrics.get(suffix))
                            dynamic_outcomes[key] = {
                                "label": f"{action} - {suffix.replace('_', ' ')}",
                                "unit": unit,
                                "kind": "count" if suffix == "count" else "numeric",
                            }
            rows.append(row)
    return pd.DataFrame(rows), dynamic_outcomes


def _eligible_outcomes(
    study_id: UUID,
    db: Session,
    dynamic: dict[str, dict],
) -> dict[str, dict]:
    outcomes = {
        key: {
            **definition,
            "source_key": key,
            "registered": False,
            "inference_eligible": False,
        }
        for key, definition in {**BUILTIN_OUTCOMES, **dynamic}.items()
    }
    variables = (
        db.query(ResearchVariable)
        .filter(
            ResearchVariable.study_id == study_id,
            ResearchVariable.validation_status == "validated",
            ResearchVariable.source_key.isnot(None),
        )
        .all()
    )
    for variable in variables:
        if variable.source_key in outcomes:
            outcomes[str(variable.id)] = {
                **outcomes[variable.source_key],
                "label": variable.name,
                "unit": variable.unit or outcomes[variable.source_key].get("unit"),
                "kind": variable.var_type or outcomes[variable.source_key].get("kind"),
                "source_key": variable.source_key,
                "role": variable.role,
                "missing_policy": variable.missing_policy,
                "aggregation": variable.aggregation,
                "time_axis": variable.time_axis,
                "registered": True,
                "inference_eligible": True,
                "variable_id": str(variable.id),
            }
    return outcomes


def get_report_templates(study: Study, db: Session) -> list[dict]:
    accepted = [
        participant
        for participant in study.participants
        if participant.consent_status == ConsentStatus.accepted
        and getattr(participant, "is_active", True)
    ]
    control = next((group for group in study.groups if group.role == "control"), None)
    comparison_groups = [
        group
        for group in study.groups
        if group.role in {"intervention", "comparison"}
    ]
    _, dynamic = _collect_rows(study, db)
    outcome_catalog = _eligible_outcomes(study.id, db, dynamic)
    has_inference_outcome = any(
        definition.get("inference_eligible")
        for definition in outcome_catalog.values()
    )
    result = []
    for template in TEMPLATE_DEFINITIONS:
        missing: list[str] = []
        if not accepted:
            missing.append("Nenhum participante com consentimento aceito")
        if template["key"] == "individual_longitudinal" and not any(
            participant.sessions for participant in accepted
        ):
            missing.append("Nenhuma sessão disponível")
        if template["key"] == "control_group_comparison":
            if control is None:
                missing.append("Defina um grupo com papel de controle")
            elif not any(item.group_id == control.id for item in accepted):
                missing.append("O grupo controle não possui participantes elegíveis")
            if not comparison_groups:
                missing.append("Defina ao menos um grupo de comparação ou intervenção")
        if (
            template["key"] == "control_group_comparison"
            and not has_inference_outcome
        ):
            missing.append(
                "Valide e vincule ao menos um desfecho no registro de variáveis"
            )
        result.append({**template, "eligible": not missing, "missing_requirements": missing})
    return result


def _cluster_values(frame: pd.DataFrame, source_key: str) -> pd.Series:
    numeric = pd.to_numeric(frame[source_key], errors="coerce")
    work = pd.DataFrame(
        {"participant_id": frame["participant_id"], "value": numeric}
    ).dropna()
    return work.groupby("participant_id")["value"].mean()


def _bootstrap_ci(values: np.ndarray, confidence: float, seed: int) -> list[float] | None:
    if stats is None or len(values) < 2 or np.all(values == values[0]):
        return None
    result = stats.bootstrap(
        (values,),
        np.mean,
        confidence_level=confidence,
        method="BCa",
        n_resamples=3999,
        rng=np.random.default_rng(seed),
    )
    low, high = result.confidence_interval
    if not (math.isfinite(float(low)) and math.isfinite(float(high))):
        return None
    return [float(low), float(high)]


def _bootstrap_difference_ci(
    control: np.ndarray,
    comparison: np.ndarray,
    confidence: float,
    seed: int,
) -> list[float] | None:
    """BCa interval over participant-level aggregates (cluster bootstrap)."""
    if (
        stats is None
        or len(control) < 2
        or len(comparison) < 2
    ):
        return None
    observed = float(np.mean(comparison) - np.mean(control))
    if np.all(control == control[0]) and np.all(comparison == comparison[0]):
        return [observed, observed]

    def difference(comparison_sample, control_sample):
        return np.mean(comparison_sample) - np.mean(control_sample)

    try:
        result = stats.bootstrap(
            (comparison, control),
            difference,
            paired=False,
            confidence_level=confidence,
            method="BCa",
            n_resamples=3999,
            rng=np.random.default_rng(seed),
        )
        low, high = result.confidence_interval
        if math.isfinite(float(low)) and math.isfinite(float(high)):
            return [float(low), float(high)]
    except (ValueError, FloatingPointError):
        pass

    # BCa is mathematically undefined for some degenerate jackknife samples.
    # Retain participant-level resampling and report a percentile interval.
    rng = np.random.default_rng(seed)
    resampled = np.asarray(
        [
            np.mean(rng.choice(comparison, len(comparison), replace=True))
            - np.mean(rng.choice(control, len(control), replace=True))
            for _ in range(3999)
        ]
    )
    tail = (1 - confidence) / 2
    return [
        float(np.quantile(resampled, tail)),
        float(np.quantile(resampled, 1 - tail)),
    ]


def _descriptive(
    frame: pd.DataFrame,
    outcome_id: str,
    definition: dict,
    confidence: float,
    seed: int,
) -> dict:
    source_key = definition.get("source_key", outcome_id)
    if source_key not in frame:
        return {
            "id": outcome_id,
            "label": definition["label"],
            "available": False,
            "reason": "Fonte vinculada não está disponível no snapshot",
        }
    raw = pd.to_numeric(frame[source_key], errors="coerce")
    values = raw.dropna().astype(float)
    participant_values = _cluster_values(frame, source_key)
    if values.empty:
        return {
            "id": outcome_id,
            "label": definition["label"],
            "available": False,
            "n": 0,
            "missing": int(raw.isna().sum()),
        }
    q1, median, q3 = values.quantile([0.25, 0.5, 0.75]).tolist()
    return {
        "id": outcome_id,
        "source_key": source_key,
        "label": definition["label"],
        "unit": definition.get("unit"),
        "kind": definition.get("kind", "numeric"),
        "role": definition.get("role", "exploratory"),
        "available": True,
        "n_observations": int(values.size),
        "n_participants": int(participant_values.size),
        "missing": int(raw.isna().sum()),
        "mean": float(values.mean()),
        "sd": float(values.std(ddof=1)) if values.size > 1 else None,
        "median": float(median),
        "q1": float(q1),
        "q3": float(q3),
        "minimum": float(values.min()),
        "maximum": float(values.max()),
        "mean_ci": _bootstrap_ci(
            participant_values.to_numpy(dtype=float), confidence, seed
        ),
    }


def _hedges_g(control: np.ndarray, comparison: np.ndarray) -> float | None:
    if len(control) < 2 or len(comparison) < 2:
        return None
    pooled_df = len(control) + len(comparison) - 2
    pooled = math.sqrt(
        ((len(control) - 1) * np.var(control, ddof=1)
         + (len(comparison) - 1) * np.var(comparison, ddof=1))
        / pooled_df
    )
    if pooled == 0:
        return 0.0
    d = (float(np.mean(comparison)) - float(np.mean(control))) / pooled
    correction = 1 - (3 / (4 * pooled_df - 1)) if pooled_df > 1 else 1
    return float(d * correction)


def _between_group_analysis(
    frame: pd.DataFrame,
    outcome_id: str,
    definition: dict,
    control_group_id: str,
    comparison_group_ids: list[str],
    confidence: float,
    seed: int,
    covariates: list[dict] | None = None,
) -> list[dict]:
    source_key = definition.get("source_key", outcome_id)
    if source_key not in frame:
        return []
    covariate_sources = [
        item["source_key"]
        for item in (covariates or [])
        if item.get("source_key") in frame
        and item.get("source_key") != source_key
    ]
    work = frame[
        frame["group_id"].isin([control_group_id, *comparison_group_ids])
    ][["participant_id", "group_id", source_key, *covariate_sources]].copy()
    work["value"] = pd.to_numeric(work[source_key], errors="coerce")
    covariate_columns = []
    for index, covariate_source in enumerate(covariate_sources):
        column = f"covariate_{index}"
        work[column] = pd.to_numeric(work[covariate_source], errors="coerce")
        covariate_columns.append(column)
    aggregated = (
        work.dropna()
        .groupby(["participant_id", "group_id"], as_index=False)[
            ["value", *covariate_columns]
        ]
        .mean()
    )
    results = []
    control = aggregated[aggregated["group_id"] == control_group_id]["value"].to_numpy()
    for comparison_id in comparison_group_ids:
        comparison = aggregated[aggregated["group_id"] == comparison_id][
            "value"
        ].to_numpy()
        item = {
            "outcome_id": outcome_id,
            "outcome": definition["label"],
            "control_group_id": control_group_id,
            "comparison_group_id": comparison_id,
            "n_control": int(len(control)),
            "n_comparison": int(len(comparison)),
            "method": "Welch t + diferença de médias com HC3",
            "estimand": "Diferença média (comparação - controle)",
            "estimate": None,
            "confidence_interval": None,
            "p_value": None,
            "p_value_adjusted": None,
            "effect_size": {"name": "Hedges g", "value": _hedges_g(control, comparison)},
            "diagnostics": [],
            "sensitivity": None,
        }
        if len(control) < 2 or len(comparison) < 2:
            item["diagnostics"].append(
                "Inferência não executada: são necessários ao menos dois participantes por grupo."
            )
            results.append(item)
            continue
        item["estimate"] = float(np.mean(comparison) - np.mean(control))
        item["confidence_interval"] = _bootstrap_difference_ci(
            control, comparison, confidence, seed
        )
        if stats is not None:
            test = stats.ttest_ind(comparison, control, equal_var=False)
            item["p_value"] = float(test.pvalue)
            item["sensitivity"] = {
                "method": "Welch t",
                "p_value": float(test.pvalue),
            }
        if smf is not None:
            model_frame = aggregated[
                aggregated["group_id"].isin([control_group_id, comparison_id])
            ].copy()
            model_frame["is_comparison"] = (
                model_frame["group_id"] == comparison_id
            ).astype(int)
            formula = "value ~ is_comparison"
            if covariate_columns:
                formula += " + " + " + ".join(covariate_columns)
            fit = smf.ols(formula, data=model_frame).fit(
                cov_type="HC3"
            )
            estimate = fit.params.get("is_comparison")
            ci = fit.conf_int(alpha=1 - confidence).loc["is_comparison"]
            item["estimate"] = float(estimate)
            item["confidence_interval"] = [float(ci.iloc[0]), float(ci.iloc[1])]
            item["p_value"] = float(fit.pvalues.get("is_comparison"))
            item["formula"] = formula
            if covariate_columns:
                item["diagnostics"].append(
                    "Estimativa ajustada pelas covariáveis aprovadas; intervalo bootstrap resume a diferença participante-nível."
                )
        results.append(item)
    return results


def _longitudinal_models(
    frame: pd.DataFrame,
    outcome_id: str,
    definition: dict,
) -> list[dict]:
    source_key = definition.get("source_key", outcome_id)
    if smf is None or source_key not in frame:
        return []
    work = frame[
        ["participant_id", "group_code", "session_index", source_key]
    ].copy()
    work["value"] = pd.to_numeric(work[source_key], errors="coerce")
    work = work.dropna(subset=["value"])
    repeated = work.groupby("participant_id").size()
    if work["participant_id"].nunique() < 3 or not (repeated > 1).any():
        return []
    formula = "value ~ session_index"
    if work["group_code"].notna().nunique() > 1:
        formula = "value ~ session_index * C(group_code)"
    try:
        fit = smf.mixedlm(
            formula,
            data=work,
            groups=work["participant_id"],
        ).fit(reml=False, method="lbfgs", disp=False)
    except Exception as exc:
        if sm is not None:
            try:
                gee = sm.GEE.from_formula(
                    formula,
                    groups="participant_id",
                    data=work,
                    family=sm.families.Gaussian(),
                    cov_struct=sm.cov_struct.Exchangeable(),
                ).fit()
                conf = gee.conf_int()
                return [
                    {
                        "outcome_id": outcome_id,
                        "outcome": definition["label"],
                        "method": "GEE gaussiano (fallback do modelo misto)",
                        "formula": formula,
                        "converged": bool(gee.converged),
                        "n_participants": int(work["participant_id"].nunique()),
                        "n_observations": int(len(work)),
                        "terms": [
                            {
                                "term": name,
                                "estimate": float(value),
                                "confidence_interval": [
                                    float(conf.loc[name, 0]),
                                    float(conf.loc[name, 1]),
                                ],
                                "p_value": float(gee.pvalues.get(name)),
                            }
                            for name, value in gee.params.items()
                        ],
                        "diagnostics": [
                            f"Modelo misto não convergiu ({type(exc).__name__}); utilizado GEE."
                        ],
                    }
                ]
            except Exception as gee_exc:
                exc = gee_exc
        return [
            {
                "outcome_id": outcome_id,
                "method": "Modelo linear misto / GEE",
                "converged": False,
                "diagnostics": [
                    f"Modelos não convergiram; resultado mantido apenas descritivo ({type(exc).__name__})."
                ],
            }
        ]
    terms = []
    conf = fit.conf_int()
    for name, value in fit.params.items():
        if name == "Group Var":
            continue
        terms.append(
            {
                "term": name,
                "estimate": float(value),
                "confidence_interval": [
                    float(conf.loc[name, 0]),
                    float(conf.loc[name, 1]),
                ],
                "p_value": float(fit.pvalues.get(name)),
            }
        )
    return [
        {
            "outcome_id": outcome_id,
            "outcome": definition["label"],
            "method": "Modelo linear misto com intercepto por participante",
            "formula": formula,
            "converged": bool(fit.converged),
            "n_participants": int(work["participant_id"].nunique()),
            "n_observations": int(len(work)),
            "terms": terms,
            "diagnostics": [],
        }
    ]


def _adjust_fdr(analyses: list[dict]) -> None:
    indexed = [
        (index, item["p_value"])
        for index, item in enumerate(analyses)
        if item.get("p_value") is not None
    ]
    if not indexed:
        return
    ordered = sorted(indexed, key=lambda item: item[1])
    count = len(ordered)
    adjusted = [0.0] * count
    running = 1.0
    for reverse_index in range(count - 1, -1, -1):
        _, p_value = ordered[reverse_index]
        rank = reverse_index + 1
        running = min(running, p_value * count / rank)
        adjusted[reverse_index] = running
    for (original_index, _), value in zip(ordered, adjusted):
        analyses[original_index]["p_value_adjusted"] = float(min(value, 1.0))


def _clean(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _clean(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_clean(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value) if math.isfinite(float(value)) else None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _library_versions() -> dict[str, str]:
    result = {}
    for package in ("numpy", "pandas", "scipy", "statsmodels"):
        try:
            result[package] = version(package)
        except PackageNotFoundError:  # pragma: no cover
            result[package] = "not-installed"
    return result


def build_scientific_report(
    study_id: UUID,
    spec: dict,
    db: Session,
    *,
    full: bool = False,
) -> dict:
    study = db.query(Study).filter(Study.id == study_id).first()
    if not study:
        raise ValueError("Study not found")
    template_key = spec.get("template_key", "study_overview")
    if template_key not in {item["key"] for item in TEMPLATE_DEFINITIONS}:
        raise ValueError("Unsupported report template")

    frame, dynamic = _collect_rows(study, db)
    outcome_catalog = _eligible_outcomes(study.id, db, dynamic)
    explicit_outcomes = list(spec.get("outcome_ids") or [])
    unknown_outcomes = [
        key for key in explicit_outcomes if key not in outcome_catalog
    ]
    if unknown_outcomes:
        raise ValueError(
            "Outcome is not validated or linked to an allowed source: "
            + ", ".join(unknown_outcomes)
        )
    registered_defaults = [
        key
        for key, definition in outcome_catalog.items()
        if definition.get("inference_eligible")
        and definition.get("source_key") in frame
        and not frame[definition["source_key"]].dropna().empty
    ]
    descriptive_defaults = [
        key
        for key in BUILTIN_OUTCOMES
        if key in frame and not frame[key].dropna().empty
    ]
    requested = explicit_outcomes or registered_defaults or descriptive_defaults
    confidence = float(spec.get("confidence_level", 0.95))
    seed = int(spec.get("seed", 20260726))

    requested_covariates = {str(item) for item in spec.get("covariate_ids") or []}
    eligible_covariates = {
        str(variable.id)
        for variable in db.query(ResearchVariable)
        .filter(
            ResearchVariable.study_id == study.id,
            ResearchVariable.validation_status == "validated",
            ResearchVariable.source_key.isnot(None),
        )
        .all()
        if variable.role == "covariate"
        and variable.source_key in {definition.get("source_key") for definition in outcome_catalog.values()}
    }
    if requested_covariates - eligible_covariates:
        raise ValueError("Covariates must be validated and linked to this study")

    if template_key == "individual_longitudinal":
        participant_id = str(spec.get("participant_id") or "")
        if not participant_id:
            raise ValueError("participant_id is required for an individual report")
        frame = frame[frame["participant_id"] == participant_id]
        if frame.empty:
            raise ValueError(
                "Participant has no eligible, consented sessions in this study"
            )

    descriptions = [
        _descriptive(frame, outcome_id, outcome_catalog[outcome_id], confidence, seed)
        for outcome_id in requested
    ]
    analyses: list[dict] = []
    if template_key == "control_group_comparison":
        control_id = str(spec.get("control_group_id") or "")
        comparison_ids = [
            str(item) for item in spec.get("comparison_group_ids") or []
        ]
        if not control_id or not comparison_ids:
            raise ValueError(
                "control_group_id and comparison_group_ids are required"
            )
        group_map = {str(group.id): group for group in study.groups}
        if (
            control_id not in group_map
            or group_map[control_id].role != "control"
            or any(item not in group_map for item in comparison_ids)
        ):
            raise ValueError("Control and comparison groups must belong to this study")
        invalid_inference = [
            key
            for key in requested
            if not outcome_catalog[key].get("inference_eligible")
        ]
        if invalid_inference:
            raise ValueError(
                "Control comparison requires validated, linked outcomes"
            )
        for outcome_id in requested:
            analyses.extend(
                _between_group_analysis(
                    frame,
                    outcome_id,
                    outcome_catalog[outcome_id],
                    control_id,
                    comparison_ids,
                    confidence,
                    seed,
                    [
                        outcome_catalog[item]
                        for item in requested_covariates
                        if item in outcome_catalog
                    ],
                )
            )
    elif full and template_key == "study_overview":
        for outcome_id in requested:
            analyses.extend(
                _longitudinal_models(
                    frame, outcome_id, outcome_catalog[outcome_id]
                )
            )

    secondary = [
        item
        for item in analyses
        if outcome_catalog.get(item.get("outcome_id"), {}).get("role")
        != "primary_outcome"
    ]
    _adjust_fdr(secondary)

    accepted_participants = {
        str(participant.id)
        for participant in study.participants
        if participant.consent_status == ConsentStatus.accepted
        and getattr(participant, "is_active", True)
    }
    total_sessions = sum(
        len(participant.sessions) for participant in study.participants
    )
    excluded_inactive = sum(
        1
        for participant in study.participants
        if participant.consent_status == ConsentStatus.accepted
        and not getattr(participant, "is_active", True)
    )
    excluded_consent = sum(
        1
        for participant in study.participants
        if participant.consent_status != ConsentStatus.accepted
    )
    snapshot_columns = [
        "participant_id",
        "group_id",
        "session_id",
        "session_index",
        "condition",
        "recorded_at",
        *sorted(
            {
                outcome_catalog[key].get("source_key", key)
                for key in requested
            }
        ),
    ]
    snapshot_records = frame[
        [column for column in snapshot_columns if column in frame]
    ].to_dict(orient="records")
    snapshot_payload = {
        "methodology_version": METHODOLOGY_VERSION,
        "spec": spec,
        "rows": _clean(snapshot_records),
        "included_participant_ids": sorted(accepted_participants),
    }
    snapshot_hash = hashlib.sha256(
        json.dumps(
            snapshot_payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()
    design = (study.config or {}).get("design", "not_configured")
    randomized = design in {"experimental", "crossover"}

    limitations = [
        "Os resultados descrevem os dados disponíveis e não constituem diagnóstico.",
        "Associações não implicam causalidade.",
        "Participantes sem consentimento aceito foram excluídos.",
    ]
    if template_key == "individual_longitudinal":
        limitations.append(
            "Não foram executados testes populacionais para o relatório individual (n=1)."
        )
    if not randomized:
        limitations.append(
            "O desenho não foi identificado como randomizado; estimativas entre grupos são associativas."
        )
    if not requested:
        limitations.append(
            "Nenhum desfecho mensurável e validado estava disponível no snapshot."
        )

    result = {
        "template_key": template_key,
        "scope_type": next(
            item["scope"]
            for item in TEMPLATE_DEFINITIONS
            if item["key"] == template_key
        ),
        "methodology_version": METHODOLOGY_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "study": {
            "id": str(study.id),
            "name": study.name,
            "description": study.description,
            "design": design,
            "protocol_version": study.protocol_version,
            "reporting_framework": "CONSORT-inspired"
            if randomized
            else "STROBE-inspired",
        },
        "flow": {
            "participants_total": len(study.participants),
            "participants_included": len(accepted_participants),
            "participants_excluded_consent": excluded_consent,
            "participants_excluded_inactive": excluded_inactive,
            "sessions_total": total_sessions,
            "sessions_included": int(len(frame)),
        },
        "summary": {
            "outcomes_available": sum(
                1 for item in descriptions if item.get("available")
            ),
            "analyses_executed": len(analyses),
            "groups": [
                {
                    "id": str(group.id),
                    "code": group.code,
                    "name": group.name,
                    "role": group.role,
                    "participant_count": sum(
                        1
                        for participant in study.participants
                        if participant.group_id == group.id
                        and participant.consent_status == ConsentStatus.accepted
                        and getattr(participant, "is_active", True)
                    ),
                }
                for group in study.groups
            ],
        },
        "outcome_catalog": [
            {"id": key, **definition}
            for key, definition in outcome_catalog.items()
        ],
        "outcomes": descriptions,
        "analyses": analyses,
        "methods": {
            "confidence_level": confidence,
            "alpha": float(spec.get("alpha", 0.05)),
            "multiplicity": spec.get("multiplicity", "fdr_bh"),
            "bootstrap": "BCa em nível de participante, 3999 reamostragens",
            "seed": seed,
            "library_versions": _library_versions(),
            "included_participant_ids": sorted(accepted_participants),
            "missing_data": "Sem imputação silenciosa; política da variável quando configurada.",
            "selection": "Método recomendado pelo desenho e tipo da variável, com revisão do pesquisador.",
        },
        "quality": {
            "video_observations": int(
                frame.get("video.valid_frame_ratio", pd.Series(dtype=float))
                .notna()
                .sum()
            ),
            "eeg_observations": int(
                frame.get("eeg.valid_ratio", pd.Series(dtype=float))
                .notna()
                .sum()
            ),
        },
        "limitations": limitations,
        "data_snapshot_hash": snapshot_hash,
        "series": [],
    }
    # itertuples normalizes dotted column names unpredictably; attach chart
    # values from records instead.
    result["series"] = []
    for record in frame.to_dict(orient="records"):
        item = {
            "participant_id": record["participant_id"],
            "participant_code": record["participant_code"],
            "group_name": record["group_name"],
            "condition": record["condition"],
            "session_index": int(record["session_index"]),
            "recorded_at": record["recorded_at"],
        }
        for outcome_id in requested:
            source_key = outcome_catalog[outcome_id].get("source_key", outcome_id)
            item[outcome_id] = _float(record.get(source_key))
        result["series"].append(item)
    return _clean(result)
