# Builds Titus Android APK for testers (no Play Store required).
# Requires: Expo account — run "npm run eas:login" once first.
#
# Important: this repo lives under OneDrive. EAS packs OneDrive reparse
# points into a broken tarball, so we stage a clean copy on local disk first.

$ErrorActionPreference = "Stop"
$Mobile = Split-Path -Parent $PSScriptRoot
$env:NODE_OPTIONS = "--dns-result-order=ipv4first"

function Invoke-Eas {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$EasArgs)

  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & npx --yes eas-cli@16.32.0 @EasArgs
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction

  if ($exitCode -ne 0) {
    exit $exitCode
  }
}

Write-Host "==> Staging a clean mobile copy (avoids OneDrive reparse-point tar bugs)..." -ForegroundColor Cyan
$Stage = Join-Path $env:LOCALAPPDATA "titus-eas-mobile"
if (Test-Path $Stage) {
  Remove-Item -Recurse -Force $Stage
}
New-Item -ItemType Directory -Path $Stage | Out-Null

# Copy only what EAS needs — materialize real files, skip junk.
$excludeDirs = @('node_modules', '_asset-temp', '.expo', 'dist', 'web-build')
Get-ChildItem -Path $Mobile -Force | Where-Object {
  -not ($_.PSIsContainer -and $excludeDirs -contains $_.Name)
} | ForEach-Object {
  $dest = Join-Path $Stage $_.Name
  if ($_.PSIsContainer) {
    robocopy $_.FullName $dest /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
      throw "robocopy failed for $($_.Name) (exit $LASTEXITCODE)"
    }
  } else {
    Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
  }
}

# Ensure a local .easignore exists in the staged project.
@"
node_modules/
.expo/
dist/
web-build/
*.log
.DS_Store
_asset-temp/
"@ | Set-Content -Path (Join-Path $Stage ".easignore") -Encoding utf8

# OneDrive marks files ReadOnly; that breaks tar extract on EAS Linux workers.
cmd /c "attrib -R `"$Stage\*.*`" /S /D" | Out-Null
Get-ChildItem -Path $Stage -Recurse -Force | ForEach-Object {
  try {
    $_.IsReadOnly = $false
    $_.Attributes = ($_.Attributes -band (-bnot [IO.FileAttributes]::ReadOnly))
  } catch {}
}

Set-Location $Stage
$env:EAS_NO_VCS = "1"
$env:EAS_PROJECT_ROOT = $Stage

Write-Host "==> Installing dependencies in staged copy (needed for local Expo config)..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "==> Checking Expo login..." -ForegroundColor Cyan
Invoke-Eas whoami

if (-not (Select-String -Path (Join-Path $Stage "app.json") -Pattern "projectId" -Quiet)) {
  Write-Host ""
  Write-Host "==> Linking Expo project (first time only)..." -ForegroundColor Cyan
  Invoke-Eas init
}

Write-Host ""
Write-Host "==> Starting EAS Android APK build (preview profile)..." -ForegroundColor Cyan
Write-Host "    Staged project: $Stage" -ForegroundColor Gray
Write-Host "    This runs on Expo servers. You will get a download link when done." -ForegroundColor Gray
Write-Host ""

Invoke-Eas build --platform android --profile preview --non-interactive

Write-Host ""
Write-Host "When the build finishes, share the APK link with users." -ForegroundColor Green
Write-Host "They download and install on Android (enable Install unknown apps if prompted)." -ForegroundColor Green
