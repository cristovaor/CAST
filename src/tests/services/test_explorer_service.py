from app.db.models import Participant, Session as DbSession, VideoAsset
from app.domains.explorer.service import build_explorer_manifest
from tests.utils import create_random_project, create_random_study


def test_manifest_aggregates_descriptors_without_samples(db, normal_user):
    project = create_random_project(db, normal_user.organization_id)
    study = create_random_study(db, project.id)
    participant = Participant(study_id=study.id, external_code="explorer-test")
    db.add(participant)
    db.flush()
    session = DbSession(participant_id=participant.id, duration_seconds=12.5)
    db.add(session)
    db.flush()
    video = VideoAsset(
        session_id=session.id,
        filename="session.mp4",
        mime_type="video/mp4",
        duration_seconds=12.5,
        quality_report={"fps": 30},
    )
    db.add(video)
    db.commit()

    manifest = build_explorer_manifest(db, session)

    assert manifest.end_time_us == 12_500_000
    assert [track.modality for track in manifest.tracks] == ["video"]
    assert "samples" not in manifest.tracks[0].model_dump()

