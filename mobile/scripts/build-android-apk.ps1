# Builds PapaT Android APK for testers (no Play Store required).
# Requires: Expo account — run "npm run eas:login" once first.

$Mobile = Split-Path -Parent $PSScriptRoot
$env:NODE_OPTIONS = "--dns-result-order=ipv4first"

Set-Location $Mobile

function Invoke-Eas {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$EasArgs)

  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & npx eas @EasArgs
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction

  if ($exitCode -ne 0) {
    exit $exitCode
  }
}

Write-Host "==> Installing mobile dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "==> Checking Expo login..." -ForegroundColor Cyan
Invoke-Eas whoami

if (-not (Select-String -Path "app.json" -Pattern "projectId" -Quiet)) {
  Write-Host ""
  Write-Host "==> Linking Expo project (first time only)..." -ForegroundColor Cyan
  Invoke-Eas init
}

Write-Host ""
Write-Host "==> Starting EAS Android APK build (preview profile)..." -ForegroundColor Cyan
Write-Host "    This runs on Expo servers. You will get a download link when done." -ForegroundColor Gray
Write-Host ""

Invoke-Eas build --platform android --profile preview

Write-Host ""
Write-Host "When the build finishes, share the APK link with users." -ForegroundColor Green
Write-Host "They download and install on Android (enable Install unknown apps if prompted)." -ForegroundColor Green
