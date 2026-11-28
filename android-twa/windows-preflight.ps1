# FarmPro Android build environment preflight (Windows PowerShell)
# Safe read-only checks. Does not create, access or upload signing secrets.
$ErrorActionPreference = "Continue"
$failed = $false
function Check-Command([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Host "[MISSING] $Name" -ForegroundColor Yellow
    return $false
  }
  Write-Host "[OK] $Name : $($cmd.Source)" -ForegroundColor Green
  return $true
}
Write-Host "FarmPro Android AAB prerequisites"
$hasNode = Check-Command "node"
$hasNpm = Check-Command "npm"
$hasJava = Check-Command "java"
if ($hasNode) { node --version }
if ($hasNpm) { npm --version }
if ($hasJava) { java -version }
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk -and $env:LOCALAPPDATA) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
if ($sdk -and (Test-Path $sdk)) {
  Write-Host "[OK] Android SDK directory: $sdk" -ForegroundColor Green
  $platforms = Join-Path $sdk "platforms"
  $api36 = Join-Path $platforms "android-36"
  if (Test-Path $api36) {
    Write-Host "[OK] Android 36 platform present" -ForegroundColor Green
  } else {
    Write-Host "[MISSING] Android 36 platform; install it via Android Studio SDK Manager." -ForegroundColor Yellow
    $failed = $true
  }
} else {
  Write-Host "[MISSING] Android SDK. Install Android Studio and SDK Platform 36." -ForegroundColor Yellow
  $failed = $true
}
if (-not ($hasNode -and $hasNpm -and $hasJava)) { $failed = $true }
$manifest = Join-Path $PSScriptRoot "twa-manifest.json"
if (Test-Path $manifest) {
  if ($hasNode) { & node (Join-Path $PSScriptRoot "check-config.mjs"); if ($LASTEXITCODE -ne 0) { $failed = $true } }
} else {
  Write-Host "[MISSING] twa-manifest.json" -ForegroundColor Red
  $failed = $true
}
Write-Host ""
if ($failed) {
  Write-Host "Not ready to build. Install the missing components; do NOT upload a build yet." -ForegroundColor Yellow
  exit 1
}
Write-Host "Prerequisites detected. Next: initialize Bubblewrap and inspect target SDK/Gradle and signing." -ForegroundColor Green
Write-Host "No AAB has been built or signed by this check."
