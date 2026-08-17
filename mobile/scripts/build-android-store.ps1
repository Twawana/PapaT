# Builds Titus Android App Bundle (.aab) for Google Play Store.

$ErrorActionPreference = "Stop"
$Mobile = Split-Path -Parent $PSScriptRoot
$env:NODE_OPTIONS = "--dns-result-order=ipv4first"

Set-Location $Mobile

npm install

npx eas whoami 2>$null
if ($LASTEXITCODE -ne 0) {
  npx eas login
}

Write-Host "==> Building production AAB for Google Play..." -ForegroundColor Cyan
npx eas build --platform android --profile production

Write-Host ""
Write-Host "Upload the .aab from the EAS dashboard to Google Play Console." -ForegroundColor Green
Write-Host "Or run: npm run submit:android (after adding google-service-account.json)" -ForegroundColor Gray
