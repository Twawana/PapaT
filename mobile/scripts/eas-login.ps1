# Fix EAS login when api.expo.dev fails (IPv6/DNS issues on some routers).
$env:NODE_OPTIONS = "--dns-result-order=ipv4first"

Set-Location (Split-Path -Parent $PSScriptRoot)

$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"

Write-Host "Logging in to Expo (IPv4-first DNS)..." -ForegroundColor Cyan
& npx eas login
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorAction

if ($exitCode -ne 0) { exit $exitCode }

Write-Host ""
$ErrorActionPreference = "Continue"
& npx eas whoami
$ErrorActionPreference = $previousErrorAction
