# Builds Titus-Setup.exe for distribution (developers only).
# End users double-click the installer - no Node.js or npm required.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Set-Location $Root

Write-Host "==> Installing dependencies..." -ForegroundColor Cyan
npm install
npm install --prefix host-server

Write-Host "==> Building host server..." -ForegroundColor Cyan
npm run build:host

if (Test-Path "dist") {
  Write-Host "==> Cleaning old dist/ (close Titus if open)..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$outDir = Join-Path $env:LOCALAPPDATA "Titus-build"
if (Test-Path $outDir) {
  Remove-Item -Recurse -Force $outDir -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "==> Building Windows installer (output: $outDir)..." -ForegroundColor Cyan
npx electron-builder --win nsis "--config.directories.output=$outDir"

$setup = Get-ChildItem -Path $outDir -Filter "Titus-Setup*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($setup) {
  Write-Host ""
  Write-Host "Done! Give users this file:" -ForegroundColor Green
  Write-Host "  $($setup.FullName)" -ForegroundColor White
  Write-Host ""
  Write-Host "Users install like any other app: Start Menu > Titus" -ForegroundColor Green
} else {
  Write-Host ("Build finished but installer not found. Check: " + $outDir) -ForegroundColor Yellow
}
