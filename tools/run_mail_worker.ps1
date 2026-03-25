param(
    [Parameter(Mandatory = $true)]
    [string]$ServiceAccountPath,

    [string]$FromEmail = "mwinterman@washoecounty.gov",

    [string]$PublicBaseUrl = "https://mitchwinterman.github.io/community-resource-finder",

    [int]$Limit = 25
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path -LiteralPath $ServiceAccountPath -PathType Leaf)) {
    throw "Service account file not found: $ServiceAccountPath"
}

$env:GOOGLE_APPLICATION_CREDENTIALS = $ServiceAccountPath

if ($FromEmail) {
    $env:CRF_OUTLOOK_FROM_EMAIL = $FromEmail
}

if ($PublicBaseUrl) {
    $env:CRF_PUBLIC_BASE_URL = $PublicBaseUrl
}

Push-Location $repoRoot
try {
    & npm.cmd run mail-worker -- --limit $Limit
    if ($LASTEXITCODE -ne 0) {
        throw "mail-worker exited with code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
