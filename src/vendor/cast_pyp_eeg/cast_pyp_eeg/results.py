from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Mapping

from .version import MDMP_COMMIT, MDMP_VERSION, UPSTREAM_COMMIT, __version__


@dataclass(frozen=True)
class Artifact:
    kind: str
    path: str
    content_type: str
    units: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    @classmethod
    def from_path(
        cls,
        kind: str,
        path: str | Path,
        content_type: str,
        *,
        units: str | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> "Artifact":
        return cls(
            kind=kind,
            path=str(Path(path)),
            content_type=content_type,
            units=units,
            metadata=metadata or {},
        )


@dataclass(frozen=True)
class AnalysisResult:
    kind: str
    artifacts: tuple[Artifact, ...] = ()
    metrics: Mapping[str, Any] = field(default_factory=dict)
    warnings: tuple[str, ...] = ()
    units: Mapping[str, str] = field(default_factory=dict)
    provenance: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"schema": "eeg-result-v1", **asdict(self)}


@dataclass(frozen=True)
class PipelineResult:
    steps: tuple[AnalysisResult, ...]
    warnings: tuple[str, ...] = ()
    provenance: Mapping[str, Any] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        steps: list[AnalysisResult],
        *,
        warnings: list[str] | None = None,
        extra_provenance: Mapping[str, Any] | None = None,
    ) -> "PipelineResult":
        provenance = {
            "package": "cast-pyp-eeg",
            "package_version": __version__,
            "upstream_commit": UPSTREAM_COMMIT,
            "mdmp_version": MDMP_VERSION,
            "mdmp_commit": MDMP_COMMIT,
        }
        provenance.update(extra_provenance or {})
        return cls(
            steps=tuple(steps),
            warnings=tuple(warnings or ()),
            provenance=provenance,
        )

    def to_dict(self) -> dict[str, Any]:
        return {"schema": "eeg-result-v1", **asdict(self)}
