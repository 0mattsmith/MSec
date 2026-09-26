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
    Write-Host "Desktop client ID set." -ForegroundColor Green

    if ($DesktopClientSecret) {
        # The secret goes to .env.local, never oauth-config.json: that file is
        # tracked, this repository is public, and GitHub's push protection
        # rejects a GOCSPX- value outright.
        $envPath = ".env.local"
        $line = "VITE_GOOGLE_DESKTOP_CLIENT_SECRET=$DesktopClientSecret"
        if (Test-Path $envPath) {
            $lines = @(Get-Content $envPath | Where-Object { $_ -notmatch '^VITE_GOOGLE_DESKTOP_CLIENT_SECRET=' })
            $lines += $line
            Set-Content $envPath ($lines -join "`n")
        } else {
            Set-Content $envPath $line
        }
        Write-Host "Desktop client secret written to .env.local (gitignored)." -ForegroundColor Green
        Write-Host ""
        Write-Host "  CI builds need it too. Add it as a repository secret named" -ForegroundColor Cyan
        Write-Host "  GOOGLE_DESKTOP_CLIENT_SECRET at:" -ForegroundColor Cyan
        Write-Host "  https://github.com/0mattsmith/MSec/settings/secrets/actions" -ForegroundColor Cyan
        Write-Host "  Without it, released desktop builds will say sign-in isn't configured." -ForegroundColor DarkGray
    } else {
        Write-Host "  NOTE: no -DesktopClientSecret given. Google requires one for 'Desktop app'" -ForegroundColor Yellow
        Write-Host "        clients, so sign-in will report it as missing until you set" -ForegroundColor Yellow
        Write-Host "        VITE_GOOGLE_DESKTOP_CLIENT_SECRET in .env.local." -ForegroundColor Yellow
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
