param(
    [Parameter(Mandatory = $true)]
    [string]$ServiceAccountPath,

    [string]$FromEmail = "mwinterman@washoecounty.gov",

    [string]$PublicBaseUrl = "https://mitchwinterman.github.io/community-resource-finder",

    [int]$Limit = 25,

    [bool]$Paused = $true
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

if ($Paused) {
    Write-Host "CRF mail worker is paused. No outbound mail or worker actions were processed."
    Write-Host "To re-enable from Task Scheduler, add -Paused:`$false to this script's arguments and enable the task."
    exit 0
}

if (-not (Test-Path -LiteralPath $ServiceAccountPath -PathType Leaf)) {
    throw "Service account file not found: $ServiceAccountPath"
}

$env:GOOGLE_APPLICATION_CREDENTIALS = $ServiceAccountPath
$env:CRF_MAIL_WORKER_ENABLED = "1"
$env:CRF_MAIL_WORKER_DISABLED = "0"

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
