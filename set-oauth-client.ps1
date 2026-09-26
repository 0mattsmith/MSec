# set-oauth-client.ps1 — point MSec's native builds at your Google OAuth clients.
#
# Usage (from the MSec folder):
#   .\set-oauth-client.ps1 -DesktopClientId "123-abc.apps.googleusercontent.com" `
#                          -DesktopClientSecret "GOCSPX-..." `
#                          -AndroidClientId "123-xyz.apps.googleusercontent.com"
#
# Either pair may be supplied on its own — pass only what you have.
#
# Why a script rather than editing JSON by hand: the Android redirect scheme is
# the client ID reversed, and it has to be written into BOTH oauth-config.json
# and src-tauri/tauri.conf.json. Setting them separately is how they end up
# disagreeing, and the symptom is a sign-in that hangs with no error.
#
# See SYNC.md for how to create the clients in the first place.

param(
    [string]$DesktopClientId,
    [string]$DesktopClientSecret,
    [string]$AndroidClientId
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $DesktopClientId -and -not $AndroidClientId) {
    Write-Host "Nothing to do. Pass -DesktopClientId and/or -AndroidClientId." -ForegroundColor Yellow
    Write-Host "  .\set-oauth-client.ps1 -AndroidClientId ""123-xyz.apps.googleusercontent.com"""
    exit 1
}

$configPath = "oauth-config.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json

if ($DesktopClientId) {
    if ($DesktopClientId -notmatch '\.apps\.googleusercontent\.com$') {
        Write-Host "ERROR: that doesn't look like a Google client ID (expected it to end .apps.googleusercontent.com)." -ForegroundColor Red
        exit 1
    }
    $config.desktop.clientId = $DesktopClientId
    if ($DesktopClientSecret) { $config.desktop.clientSecret = $DesktopClientSecret }
    Write-Host "Desktop client set." -ForegroundColor Green
    if (-not $DesktopClientSecret -and $config.desktop.clientSecret -like "PASTE_*") {
        Write-Host "  WARNING: no client secret set. Google requires one for 'Desktop app' clients," -ForegroundColor Yellow
        Write-Host "           so the token exchange will fail without it." -ForegroundColor Yellow
    }
}

if ($AndroidClientId) {
    if ($AndroidClientId -notmatch '\.apps\.googleusercontent\.com$') {
        Write-Host "ERROR: that doesn't look like a Google client ID." -ForegroundColor Red
        exit 1
    }
    $config.android.clientId = $AndroidClientId

    # Google's Android clients redirect to the client ID reversed.
    $bare = $AndroidClientId -replace '\.apps\.googleusercontent\.com$', ''
    $scheme = "com.googleusercontent.apps.$bare"

    $tauriPath = "src-tauri/tauri.conf.json"
    $tauri = Get-Content $tauriPath -Raw | ConvertFrom-Json
    $tauri.plugins.'deep-link'.mobile[0].scheme = @($scheme)
    ($tauri | ConvertTo-Json -Depth 20) | Set-Content $tauriPath -NoNewline
    Add-Content $tauriPath "`n"

    Write-Host "Android client set." -ForegroundColor Green
    Write-Host "  redirect scheme: $scheme" -ForegroundColor DarkGray
}

($config | ConvertTo-Json -Depth 20) | Set-Content $configPath -NoNewline
Add-Content $configPath "`n"

Write-Host ""
Write-Host "Written to oauth-config.json." -ForegroundColor Green
Write-Host "Both files are read at BUILD time, so cut a new release for this to reach your devices:" -ForegroundColor Cyan
Write-Host "  .\push.ps1 ""Configure Google sign-in"" -Release"
Write-Host ""
