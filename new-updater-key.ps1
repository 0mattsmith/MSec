# new-updater-key.ps1 — create the signing keypair used for silent desktop
# updates, and wire the public half into tauri.conf.json. Run this ONCE.
#
#   .\new-updater-key.ps1
#
# How it fits together:
#   * CI signs each installer with the PRIVATE key and publishes latest.json
#   * the installed app carries the PUBLIC key and verifies that signature
#     before applying anything
#
# That check is what makes silent updating safe: without it, anyone able to
# intercept the download could hand your app a modified build.
#
# Keep the private key safe. Losing it means existing installs can no longer
# verify updates and everyone must reinstall manually.

param([string]$Password)

Set-Location $PSScriptRoot

if (-not (Test-Path "node_modules/@tauri-apps/cli")) {
    Write-Host "Installing dependencies first..." -ForegroundColor Cyan
    npm install
}

if (-not $Password) {
    $secure = Read-Host "Password to protect the updater key (press Enter for none)" -AsSecureString
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

$keyPath = Join-Path $PSScriptRoot "msec-updater.key"
if (Test-Path $keyPath) {
    Write-Host "$keyPath already exists — delete it first if you really want a new key." -ForegroundColor Red
    Write-Host "(Replacing it means existing installs can no longer verify updates.)" -ForegroundColor Yellow
    exit 1
}

Write-Host "Generating updater keypair..." -ForegroundColor Cyan
if ($Password) {
    npx tauri signer generate -w $keyPath --password $Password
} else {
    npx tauri signer generate -w $keyPath --password ""
}
if ($LASTEXITCODE -ne 0) { Write-Host "Key generation failed." -ForegroundColor Red; exit 1 }

$publicKey = (Get-Content "$keyPath.pub" -Raw).Trim()
$privateKey = (Get-Content $keyPath -Raw).Trim()

# Put the public key into tauri.conf.json so builds embed it.
$confPath = "src-tauri/tauri.conf.json"
$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$conf.plugins.updater.pubkey = $publicKey
($conf | ConvertTo-Json -Depth 20) | Set-Content $confPath -NoNewline
Add-Content $confPath "`n"
Write-Host "Public key written into $confPath" -ForegroundColor Green

$privateKey | Set-Clipboard

Write-Host ""
Write-Host "==================== NEXT STEPS ====================" -ForegroundColor Cyan
Write-Host "Add these secrets at:" -ForegroundColor Cyan
Write-Host "  https://github.com/0mattsmith/MSec/settings/secrets/actions"
Write-Host ""
Write-Host "  TAURI_SIGNING_PRIVATE_KEY           <- copied to your clipboard"
if ($Password) {
    Write-Host "  TAURI_SIGNING_PRIVATE_KEY_PASSWORD  <- the password you just chose"
} else {
    Write-Host "  TAURI_SIGNING_PRIVATE_KEY_PASSWORD  <- leave empty (no password set)"
}
Write-Host ""
Write-Host "Then commit the updated tauri.conf.json and cut a release:" -ForegroundColor Cyan
Write-Host "  .\push.ps1 `"Enable signed auto-updates`" -Release"
Write-Host ""
Write-Host "Back up msec-updater.key somewhere safe — it is gitignored." -ForegroundColor Yellow
Write-Host "Note: the FIRST release after this is the one that gains the ability" -ForegroundColor Yellow
Write-Host "to self-update; installs older than it still need updating by hand." -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
