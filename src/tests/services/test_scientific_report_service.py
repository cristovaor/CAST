from app.db.models import (
    AssessmentType,
    ConsentStatus,
    LearningAssessment,
    Participant,
    ResearchVariable,
    Session,
    StudyGroup,
)
from app.services.scientific_report_service import _adjust_fdr, build_scientific_report
from tests.utils import create_random_project, create_random_study


def _scientific_study(db, normal_user):
    project = create_random_project(db, normal_user.organization_id)
    study = create_random_study(db, project.id)
    control = StudyGroup(
        study_id=study.id, code="CTRL", name="Controle", role="control"
    )
    intervention = StudyGroup(
        study_id=study.id, code="INT", name="Intervenção", role="intervention"
    )
    db.add_all([control, intervention])
    db.flush()

    participants = []
    for group_index, group in enumerate((control, intervention)):
        for participant_index in range(4):
            participant = Participant(
                study_id=study.id,
                group_id=group.id,
                external_code=f"{group.code}-{participant_index}",
                consent_status=ConsentStatus.accepted,
            )
            db.add(participant)
            db.flush()
            participants.append(participant)
            for session_index in range(2):
                session = Session(
                    participant_id=participant.id,
                    condition="baseline" if session_index == 0 else "follow-up",
                    duration_seconds=600,
                )
                db.add(session)
                db.flush()
                pre = 10 + participant_index + session_index
                gain = 1 + group_index * 4 + session_index
                db.add_all(
                    [
                        LearningAssessment(
                            session_id=session.id,
                            type=AssessmentType.pre_test,
                            score=pre,
                            max_score=20,
                        ),
                        LearningAssessment(
                            session_id=session.id,
                            type=AssessmentType.post_test,
                            score=pre + gain,
                            max_score=20,
                        ),
                    ]
                )

    excluded = Participant(
        study_id=study.id,
        group_id=intervention.id,
        external_code="SEM-CONSENTIMENTO",
        consent_status=ConsentStatus.pending,
    )
    variable = ResearchVariable(
        study_id=study.id,
        name="Ganho de aprendizagem",
        code="learning_gain",
        var_type="numeric",
        source_key="assessment.change",
        aggregation="participant_mean",
        time_axis="session",
        missing_policy="complete_case",
        role="primary_outcome",
        validation_status="validated",
    )
    db.add_all([excluded, variable])
    db.commit()
    return study, control, intervention, participants, variable


def test_control_report_uses_only_validated_outcome_and_cluster_bootstrap(
    db, normal_user
):
    study, control, intervention, _, variable = _scientific_study(db, normal_user)
    spec = {
        "template_key": "control_group_comparison",
        "control_group_id": str(control.id),
        "comparison_group_ids": [str(intervention.id)],
        "outcome_ids": [str(variable.id)],
        "seed": 73,
    }

    first = build_scientific_report(study.id, spec, db, full=True)
    second = build_scientific_report(study.id, spec, db, full=True)

    assert first["flow"]["participants_included"] == 8
    assert first["flow"]["participants_excluded_consent"] == 1
    assert first["analyses"][0]["estimate"] > 3
    assert first["analyses"][0]["n_control"] == 4
    assert first["analyses"][0]["n_comparison"] == 4
    assert first["analyses"][0]["confidence_interval"]
    assert first["analyses"][0]["confidence_interval"] == second["analyses"][0][
        "confidence_interval"
    ]
    assert first["data_snapshot_hash"] == second["data_snapshot_hash"]


def test_individual_report_never_runs_population_inference(db, normal_user):
    study, _, _, participants, variable = _scientific_study(db, normal_user)
    report = build_scientific_report(
        study.id,
        {
            "template_key": "individual_longitudinal",
            "participant_id": str(participants[0].id),
            "outcome_ids": [str(variable.id)],
        },
        db,
        full=True,
    )

    assert report["flow"]["sessions_included"] == 2
    assert report["analyses"] == []
    assert any("n=1" in limitation for limitation in report["limitations"])


def test_control_report_rejects_unregistered_builtin_outcome(db, normal_user):
    study, control, intervention, _, _ = _scientific_study(db, normal_user)

    try:
        build_scientific_report(
            study.id,
            {
                "template_key": "control_group_comparison",
                "control_group_id": str(control.id),
                "comparison_group_ids": [str(intervention.id)],
                "outcome_ids": ["assessment.change"],
            },
            db,
        )
    except ValueError as exc:
        assert "validated" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Unregistered outcome was accepted for inference")


def test_fdr_benjamini_hochberg_is_monotone_and_preserves_raw_p_values():
    analyses = [
        {"p_value": 0.01},
        {"p_value": 0.04},
        {"p_value": 0.03},
        {"p_value": None},
    ]

    _adjust_fdr(analyses)

    assert [item["p_value"] for item in analyses] == [0.01, 0.04, 0.03, None]
    assert analyses[0]["p_value_adjusted"] == 0.03
    assert analyses[1]["p_value_adjusted"] == 0.04
    assert analyses[2]["p_value_adjusted"] == 0.04
    assert "p_value_adjusted" not in analyses[3]
