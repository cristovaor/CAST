from __future__ import annotations

import hashlib
import io
import re
import zipfile
from pathlib import PurePosixPath
from typing import Iterable


ALLOWED_EEG_SUFFIXES = {
    ".csv",
    ".edf",
    ".bdf",
    ".fif",
    ".set",
    ".fdt",
    ".vhdr",
    ".eeg",
    ".vmrk",
    ".json",
    ".tsv",
    ".zip",
}
_BRAINVISION_REFERENCE = re.compile(
    rb"(?im)^(?:DataFile|MarkerFile)=(?P<value>[^\r\n]+)$"
)


def safe_bundle_name(name: str) -> str:
    normalized = name.replace("\\", "/").strip()
    path = PurePosixPath(normalized)
    if (
        not normalized
        or path.is_absolute()
        or ".." in path.parts
        or len(path.parts) != 1
        or ":" in normalized
    ):
        raise ValueError(f"unsafe bundle filename: {name!r}")
    if path.suffix.lower() not in ALLOWED_EEG_SUFFIXES:
        raise ValueError(f"unsupported EEG bundle extension: {path.suffix or '<none>'}")
    return path.name


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_brainvision_references(
    members: dict[str, bytes],
) -> list[str]:
    names = {name.casefold() for name in members}
    warnings: list[str] = []
    for name, contents in members.items():
        if PurePosixPath(name).suffix.lower() not in {".vhdr", ".vmrk"}:
            continue
        for match in _BRAINVISION_REFERENCE.finditer(contents):
            reference = match.group("value").decode("utf-8", errors="replace").strip()
            safe = safe_bundle_name(reference)
            if safe.casefold() not in names:
                raise ValueError(f"{name} references missing bundle file {reference!r}")
    if any(name.lower().endswith(".vhdr") for name in members):
        expected = {".vhdr", ".eeg", ".vmrk"}
        present = {PurePosixPath(name).suffix.lower() for name in members}
        missing = expected - present
        if missing:
            raise ValueError(f"incomplete BrainVision bundle; missing {sorted(missing)}")
    return warnings


def validate_bids_zip(
    data: bytes,
    *,
    max_members: int = 4096,
    max_uncompressed_bytes: int = 20 * 1024 * 1024 * 1024,
) -> dict[str, int]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = archive.infolist()
        if len(members) > max_members:
            raise ValueError("ZIP contains too many files")
        total = 0
        normalized_names: set[str] = set()
        brainvision_headers: list[tuple[PurePosixPath, bytes]] = []
        for member in members:
            path = PurePosixPath(member.filename.replace("\\", "/"))
            if path.is_absolute() or ".." in path.parts or ":" in member.filename:
                raise ValueError(f"unsafe ZIP member path: {member.filename!r}")
            if member.is_dir():
                continue
            normalized_names.add(path.as_posix().casefold())
            total += member.file_size
            if total > max_uncompressed_bytes:
                raise ValueError("ZIP uncompressed size exceeds the configured limit")
            if member.compress_size and member.file_size / member.compress_size > 500:
                raise ValueError(f"suspicious ZIP compression ratio: {member.filename!r}")
            if path.suffix.lower() in {".vhdr", ".vmrk"}:
                if member.file_size > 5 * 1024 * 1024:
                    raise ValueError(f"BrainVision header is unexpectedly large: {member.filename!r}")
                brainvision_headers.append((path, archive.read(member)))
        names = {PurePosixPath(member.filename).name for member in members if not member.is_dir()}
        if "dataset_description.json" not in names:
            raise ValueError("BIDS ZIP is missing dataset_description.json")
        for header_path, contents in brainvision_headers:
            for match in _BRAINVISION_REFERENCE.finditer(contents):
                reference = match.group("value").decode(
                    "utf-8", errors="replace"
                ).strip()
                safe = safe_bundle_name(reference)
                target = (header_path.parent / safe).as_posix().casefold()
                if target not in normalized_names:
                    raise ValueError(
                        f"{header_path} references missing ZIP member {reference!r}"
                    )
        return {"member_count": len(members), "uncompressed_bytes": total}


def primary_filename(files: Iterable[object]) -> str:
    for item in files:
        if getattr(item, "is_primary", False):
            return str(getattr(item, "filename"))
    raise ValueError("bundle has no primary file")
