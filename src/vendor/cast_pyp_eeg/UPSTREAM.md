# Upstream provenance

- Repository: <https://github.com/palomavictoriaalves/pyp-eeg>
- Pinned commit: `4074a2a391aec435a1987c0f7ea0c1183bf7eb96`
- Upstream release lineage: Pyp-EEG 2.0.0
- Retrieved: 2026-07-30
- License: Creative Commons Attribution 4.0 International (`LICENSE.txt`)

The upstream authors do not sponsor, endorse, or maintain this CAST-specific
adaptation. All CAST changes are identified in `CHANGES.md`.

The optional dynamic-network stage uses:

- Repository: <https://github.com/maods2/mdmp>
- Pinned commit: `420afe67cf89e0a656fd5346c3721063365c40e4`
- Version: `0.6.2`
- License: GNU GPL v3 only (`LICENSE-MDMP.md`)

The committed wheels were built twice from clean Git archives with
`SOURCE_DATE_EPOCH` set to each upstream commit timestamp. Both builds produced
the SHA-256 values recorded in `../wheels/SHA256SUMS`. Rebuild with
`../build_wheels.ps1 -MdmpSource <pinned-mdmp-checkout>`.
