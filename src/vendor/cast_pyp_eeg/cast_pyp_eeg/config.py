from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class Band:
    name: str
    low_hz: float
    high_hz: float

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("band name cannot be empty")
        if self.low_hz < 0 or self.high_hz <= self.low_hz:
            raise ValueError(f"invalid band range for {self.name}")


@dataclass(frozen=True)
class ROI:
    name: str
    channels: tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.name.strip() or not self.channels:
            raise ValueError("ROI requires a name and at least one channel")


@dataclass(frozen=True)
class Block:
    label: str
    start_seconds: float
    end_seconds: float

    def __post_init__(self) -> None:
        if not self.label.strip() or self.start_seconds < 0:
            raise ValueError("invalid block")
        if self.end_seconds <= self.start_seconds:
            raise ValueError("block end must be greater than start")


@dataclass(frozen=True)
class Contrast:
    name: str
    factor: str
    level_a: str
    level_b: str
    paired: bool = True


@dataclass(frozen=True)
class StudyDesign:
    subject_column: str = "subject"
    group_column: str = "group"
    condition_column: str = "condition"
    groups: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    session_pairs: tuple[tuple[str, str], ...] = ()
    contrasts: tuple[Contrast, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


DEFAULT_BANDS = (
    Band("delta", 0.5, 3.5),
    Band("theta", 4.0, 7.9),
    Band("alpha", 8.0, 12.9),
    Band("beta", 13.0, 30.0),
    Band("gamma", 30.1, 50.0),
)

PYP_EEG_V2_ROIS = (
    ROI("prefrontal", ("Fp1", "Fp2")),
    ROI("frontal", ("F7", "F3", "Fz", "F4", "F8")),
    ROI("frontocentral", ("FC5", "FC1", "FC2", "FC6")),
    ROI("central", ("C3", "Cz", "C4")),
    ROI("temporo-parietal", ("FT9", "T7", "T8", "FT10", "TP9", "TP10")),
    ROI("centro-parietal", ("CP5", "CP1", "CP2", "CP6")),
    ROI("parietal", ("P7", "P3", "Pz", "P4", "P8")),
    ROI("occipital", ("O1", "Oz", "O2")),
)

PYP_EEG_V2_BLOCKS = (
    Block("EO_1", 15.0, 135.0),
    Block("EC_1", 150.0, 270.0),
    Block("EO_2", 285.0, 405.0),
    Block("EC_2", 420.0, 540.0),
)


@dataclass(frozen=True)
class AnalysisConfig:
    profile: str = "custom"
    filter_low_hz: float = 0.5
    filter_high_hz: float = 50.0
    notch_hz: tuple[float, ...] = (60.0,)
    montage: str | None = "standard_1020"
    reference: str = "average"
    bands: tuple[Band, ...] = DEFAULT_BANDS
    rois: tuple[ROI, ...] = ()
    blocks: tuple[Block, ...] = ()
    psd_low_hz: float = 0.5
    psd_high_hz: float = 50.0
    welch_segment_seconds: float = 4.0
    welch_overlap: float = 0.5
    timeseries_window_seconds: float = 4.0
    timeseries_step_seconds: float = 1.0
    absolute_power_scale: float = 1e12
    apply_ica: bool = True
    ica_method: str = "infomax"
    ica_random_state: int = 97
    iclabel_thresholds: Mapping[str, float] = field(
        default_factory=lambda: {
            "eye blink": 0.60,
            "muscle artifact": 0.70,
            "heart beat": 0.70,
            "line noise": 0.70,
            "channel noise": 0.70,
        }
    )
    fdr_alpha: float = 0.05
    permutation_count: int = 2000
    random_seed: int = 42
    tile_seconds: int = 60

    def __post_init__(self) -> None:
        if self.filter_low_hz < 0 or self.filter_high_hz <= self.filter_low_hz:
            raise ValueError("invalid filter range")
        if not 0 <= self.welch_overlap < 1:
            raise ValueError("welch_overlap must be in [0, 1)")
        if self.timeseries_window_seconds <= 0 or self.timeseries_step_seconds <= 0:
            raise ValueError("time-series window and step must be positive")
        if not 0 < self.fdr_alpha < 1:
            raise ValueError("fdr_alpha must be in (0, 1)")

    @classmethod
    def pyp_eeg_v2(cls) -> "AnalysisConfig":
        return cls(
            profile="pyp_eeg_v2",
            bands=DEFAULT_BANDS,
            rois=PYP_EEG_V2_ROIS,
            blocks=PYP_EEG_V2_BLOCKS,
        )

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "AnalysisConfig":
        data = dict(payload)
        data["bands"] = tuple(
            band if isinstance(band, Band) else Band(**band)
            for band in data.get("bands", DEFAULT_BANDS)
        )
        data["rois"] = tuple(
            roi
            if isinstance(roi, ROI)
            else ROI(name=roi["name"], channels=tuple(roi["channels"]))
            for roi in data.get("rois", ())
        )
        data["blocks"] = tuple(
            block if isinstance(block, Block) else Block(**block)
            for block in data.get("blocks", ())
        )
        if "notch_hz" in data:
            data["notch_hz"] = tuple(float(value) for value in data["notch_hz"])
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def enabled_band_names(self) -> tuple[str, ...]:
        return tuple(band.name for band in self.bands)


def normalize_config(
    config: AnalysisConfig | Mapping[str, Any] | None,
) -> AnalysisConfig:
    if config is None:
        return AnalysisConfig()
    if isinstance(config, AnalysisConfig):
        return config
    return AnalysisConfig.from_dict(config)


def normalize_rois(
    rois: Sequence[ROI] | Mapping[str, Sequence[str]],
) -> tuple[ROI, ...]:
    if isinstance(rois, Mapping):
        return tuple(ROI(name=name, channels=tuple(channels)) for name, channels in rois.items())
    return tuple(rois)

