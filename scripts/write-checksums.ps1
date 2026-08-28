[CmdletBinding()]
param(
  [string]$ReleaseDirectory
)

if ([string]::IsNullOrWhiteSpace($ReleaseDirectory)) {
  $ReleaseDirectory = Join-Path (Split-Path -Parent $PSCommandPath) '..\release'
}

$resolvedDirectory = [System.IO.Path]::GetFullPath($ReleaseDirectory)
if (-not (Test-Path -LiteralPath $resolvedDirectory -PathType Container)) {
  throw "Release directory does not exist: $resolvedDirectory"
}

$artifacts = Get-ChildItem -LiteralPath $resolvedDirectory -Filter '*.exe' -File | Sort-Object Name
if ($artifacts.Count -eq 0) {
  throw "No .exe artifacts found in: $resolvedDirectory"
}

$lines = foreach ($artifact in $artifacts) {
  $hash = Get-FileHash -LiteralPath $artifact.FullName -Algorithm SHA256
  "{0} *{1}" -f $hash.Hash.ToLowerInvariant(), $artifact.Name
}

$checksumPath = Join-Path $resolvedDirectory 'SHA256SUMS.txt'
[System.IO.File]::WriteAllLines($checksumPath, [string[]]$lines, [System.Text.UTF8Encoding]::new($false))
Write-Output "Wrote $checksumPath"
