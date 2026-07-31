param(
    [Parameter(Mandatory = $true)]
    [string]$MdmpSource,
    [string]$Python = "python",
    [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $PSScriptRoot "wheels"
}
$pypCommit = "4074a2a391aec435a1987c0f7ea0c1183bf7eb96"
$mdmpCommit = "420afe67cf89e0a656fd5346c3721063365c40e4"
$pypEpoch = "1780950140"
$mdmpEpoch = "1784510457"
$castSource = Join-Path $PSScriptRoot "cast_pyp_eeg"
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("cast-eeg-wheels-" + [guid]::NewGuid())
$mdmpArchive = Join-Path $temporary "mdmp.zip"
$mdmpClean = Join-Path $temporary "mdmp"
$castClean = Join-Path $temporary "cast-pyp-eeg"
$buildOutput = Join-Path $temporary "dist"
$buildVenv = Join-Path $temporary "venv"

try {
    New-Item -ItemType Directory -Path $temporary, $mdmpClean, $castClean, $buildOutput -Force | Out-Null
    $actualMdmpCommit = (git -c "safe.directory=$MdmpSource" -C $MdmpSource rev-parse HEAD).Trim()
    if ($actualMdmpCommit -ne $mdmpCommit) {
        throw "MDMP checkout must be pinned to $mdmpCommit (found $actualMdmpCommit)"
    }

    # Archives guarantee generated build directories can never enter a wheel.
    git -c "safe.directory=$MdmpSource" -C $MdmpSource archive --format=zip --output=$mdmpArchive $mdmpCommit
    if ($LASTEXITCODE -ne 0) { throw "git archive failed for MDMP" }
    Expand-Archive -LiteralPath $mdmpArchive -DestinationPath $mdmpClean
    Copy-Item `
        -Path (Join-Path $castSource "*") `
        -Destination $castClean `
        -Recurse `
        -Exclude ".pytest_cache", "build", "dist", "*.egg-info", "__pycache__"

    & $Python -m venv $buildVenv
    $venvPython = Join-Path $buildVenv "Scripts/python.exe"
    if (-not (Test-Path $venvPython)) {
        $venvPython = Join-Path $buildVenv "bin/python"
    }
    & $venvPython -m pip install `
        "build==1.5.0" "twine==7.0.0" "setuptools==75.8.2" "wheel==0.45.1"

    $env:SOURCE_DATE_EPOCH = $mdmpEpoch
    & $venvPython -m build --wheel --no-isolation --outdir $buildOutput $mdmpClean
    $env:SOURCE_DATE_EPOCH = $pypEpoch
    & $venvPython -m build --wheel --no-isolation --outdir $buildOutput $castClean
    & $venvPython -m twine check (Join-Path $buildOutput "*.whl")

    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    Copy-Item -Path (Join-Path $buildOutput "*.whl") -Destination $OutputDirectory -Force
    $hashLines = @(
        Get-FileHash (Join-Path $OutputDirectory "*.whl") -Algorithm SHA256 |
            Sort-Object Path |
            ForEach-Object { "$($_.Hash.ToLowerInvariant())  $(Split-Path $_.Path -Leaf)" }
    )
    [System.IO.File]::WriteAllLines(
        (Join-Path $OutputDirectory "SHA256SUMS"),
        $hashLines,
        [System.Text.UTF8Encoding]::new($false)
    )
    $hashLines
}
finally {
    if (Test-Path -LiteralPath $temporary) {
        $resolved = (Resolve-Path -LiteralPath $temporary).Path
        $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
        if (-not $resolved.StartsWith($tempRoot)) {
            throw "Refusing to remove non-temporary path: $resolved"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
