# set-firebase-project.ps1 — point MSec at a Firebase project.
#
# Usage (from the MSec folder):
#   .\set-firebase-project.ps1 -ConfigPath .\downloaded-config.json
#   .\set-firebase-project.ps1                      # paste the snippet when prompted
#
# Get the values from Firebase Console -> Project settings -> General ->
# "Your apps" -> Web app -> Config. Paste the whole firebaseConfig object.
#
# Why a script: the same values live in firebase-applet-config.json AND
# extension/config.js. Editing them separately is how the app ends up talking to
# one project and the extension to another, and the symptom is an extension that
# signs in fine and then finds an empty vault.

param(
    [string]$ConfigPath,
    [string]$DatabaseId = "(default)"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# --- Collect the config -------------------------------------------------------
if ($ConfigPath) {
    $raw = Get-Content $ConfigPath -Raw
} else {
    Write-Host "Paste the firebaseConfig object from Firebase Console, then a blank line:" -ForegroundColor Cyan
    $lines = @()
    while ($true) {
        $line = Read-Host
        if ([string]::IsNullOrWhiteSpace($line)) { break }
        $lines += $line
    }
    $raw = $lines -join "`n"
}

# Accept either strict JSON or the JS object Firebase shows on screen.
$json = $raw -replace '(?s)^.*?firebaseConfig\s*=\s*', ''
$json = $json -replace ';\s*$', ''
$json = $json -replace '(?m)^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:', '"$1":'   # bare keys -> quoted
$json = $json -replace "'", '"'                                          # single -> double quotes
$json = $json -replace ',(\s*[}\]])', '$1'                               # trailing commas

try {
    $cfg = $json | ConvertFrom-Json
} catch {
    Write-Host "ERROR: could not parse that as a Firebase config." -ForegroundColor Red
    Write-Host "Paste the whole object, braces included, e.g.:" -ForegroundColor Yellow
    Write-Host '  { "apiKey": "...", "authDomain": "...", "projectId": "...", ... }'
    exit 1
}

foreach ($field in @("apiKey", "projectId", "authDomain", "appId")) {
    if (-not $cfg.$field) {
        Write-Host "ERROR: the config is missing '$field'." -ForegroundColor Red
        exit 1
    }
}

# --- Show what is about to change --------------------------------------------
$appConfigPath = "firebase-applet-config.json"
$old = if (Test-Path $appConfigPath) { (Get-Content $appConfigPath -Raw | ConvertFrom-Json).projectId } else { "(none)" }

Write-Host ""
Write-Host "  from : $old" -ForegroundColor DarkGray
Write-Host "  to   : $($cfg.projectId)" -ForegroundColor Green
Write-Host "  db   : $DatabaseId" -ForegroundColor DarkGray
Write-Host ""

if ($old -ne "(none)" -and $old -ne $cfg.projectId) {
    Write-Host "This changes which project your devices sync with. Vault data is NOT copied" -ForegroundColor Yellow
    Write-Host "across - each device re-uploads its local vault on first sign-in." -ForegroundColor Yellow
    $answer = Read-Host "Continue? (y/N)"
    if ($answer -ne "y") { Write-Host "Cancelled."; exit 0 }
}

# --- Write the app config -----------------------------------------------------
$appConfig = [ordered]@{
    projectId           = $cfg.projectId
    appId               = $cfg.appId
    apiKey              = $cfg.apiKey
    authDomain          = $cfg.authDomain
    firestoreDatabaseId = $DatabaseId
    storageBucket       = if ($cfg.storageBucket) { $cfg.storageBucket } else { "" }
    messagingSenderId   = if ($cfg.messagingSenderId) { $cfg.messagingSenderId } else { "" }
    measurementId       = if ($cfg.measurementId) { $cfg.measurementId } else { "" }
}
($appConfig | ConvertTo-Json -Depth 10) | Set-Content $appConfigPath -NoNewline
Add-Content $appConfigPath "`n"
Write-Host "Updated $appConfigPath" -ForegroundColor Green

# --- Write the extension config ----------------------------------------------
$extPath = "extension/config.js"
if (Test-Path $extPath) {
    $ext = Get-Content $extPath -Raw
    $ext = $ext -replace 'FIREBASE_API_KEY:\s*"[^"]*"',        "FIREBASE_API_KEY: `"$($cfg.apiKey)`""
    $ext = $ext -replace 'FIREBASE_PROJECT_ID:\s*"[^"]*"',     "FIREBASE_PROJECT_ID: `"$($cfg.projectId)`""
    $ext = $ext -replace 'FIRESTORE_DATABASE_ID:\s*"[^"]*"',   "FIRESTORE_DATABASE_ID: `"$DatabaseId`""
    Set-Content $extPath $ext -NoNewline
    Write-Host "Updated $extPath" -ForegroundColor Green
}

# --- Pin the CLI at the same project -----------------------------------------
$rc = [ordered]@{ projects = [ordered]@{ default = $cfg.projectId } }
($rc | ConvertTo-Json -Depth 10) | Set-Content ".firebaserc" -NoNewline
Add-Content ".firebaserc" "`n"
Write-Host "Updated .firebaserc" -ForegroundColor Green

Write-Host ""
Write-Host "Next, in the NEW project:" -ForegroundColor Cyan
Write-Host "  1. Authentication -> Sign-in method -> enable Google"
Write-Host "  2. Authentication -> Settings -> Authorized domains -> add 0mattsmith.github.io"
Write-Host "  3. Firestore -> create the database (pick the same region you'd want long term)"
Write-Host "  4. firebase deploy --only firestore:rules"
Write-Host "  5. Recreate the OAuth clients - they belong to the project, so the old ones"
Write-Host "     do not carry over. Then: .\set-oauth-client.ps1 ..."
Write-Host ""
Write-Host "Then rebuild, because these values are baked in at build time:" -ForegroundColor Cyan
Write-Host "  .\push.ps1 ""Move to the MSec Firebase project"" -Release"
Write-Host ""
