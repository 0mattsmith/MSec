# set-firebase-project.ps1 — point MSec at a Firebase project.
#
# Copy the config from Firebase Console (Project settings -> General -> Your
# apps -> Web app -> Config), then just run:
#
#   .\set-firebase-project.ps1
#
# It reads your clipboard. Other ways in, if you'd rather:
#
#   .\set-firebase-project.ps1 -ConfigPath .\config.json
#   .\set-firebase-project.ps1 -ProjectId msec-4f21c -ApiKey AIza... -AppId 1:48:web:9f -AuthDomain msec-4f21c.firebaseapp.com
#
# Paste format doesn't matter: the JS object Firebase shows you, strict JSON,
# single or double quotes, one line or many, with or without the surrounding
# import/initializeApp lines.
#
# Why a script: the same values live in firebase-applet-config.json AND
# extension/config.js. Editing them separately is how the app ends up talking to
# one project and the extension to another, and the symptom is an extension that
# signs in happily and then finds an empty vault.

param(
    [string]$ConfigPath,
    [string]$Config,
    [string]$ProjectId,
    [string]$ApiKey,
    [string]$AppId,
    [string]$AuthDomain,
    [string]$StorageBucket,
    [string]$MessagingSenderId,
    [string]$DatabaseId = "(default)"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# --- Pull one value out of whatever shape the config was pasted in -----------
# The optional quote after the key is what lets one pattern handle strict JSON
# ("apiKey":"x") as well as the JS object form (apiKey: "x").
function Get-Field {
    param([string]$Text, [string]$Name)
    if ($Text -match ($Name + '["'']?\s*:\s*["'']([^"'']*)["'']')) { return $Matches[1] }
    return ""
}

# --- Where is the config coming from? ----------------------------------------
$raw = ""
$source = ""

if ($ConfigPath) {
    if (-not (Test-Path $ConfigPath)) {
        Write-Host "ERROR: no file at $ConfigPath" -ForegroundColor Red
        exit 1
    }
    $raw = Get-Content $ConfigPath -Raw
    $source = "file $ConfigPath"
}
elseif ($Config) {
    $raw = $Config
    $source = "-Config argument"
}
elseif ($ProjectId -and $ApiKey -and $AppId) {
    $source = "command line"
}
else {
    # Default: the clipboard, because you have just copied it from the console.
    try {
        $raw = Get-Clipboard -Raw -ErrorAction Stop
    } catch {
        $raw = ""
    }
    $source = "clipboard"
    if (-not $raw) {
        Write-Host "Nothing usable on the clipboard." -ForegroundColor Red
        Write-Host ""
        Write-Host "Copy the config from Firebase Console (Project settings -> General ->" -ForegroundColor Yellow
        Write-Host "Your apps -> Web app -> Config) and run this again, or pass it directly:" -ForegroundColor Yellow
        Write-Host '  .\set-firebase-project.ps1 -ConfigPath .\config.json'
        Write-Host '  .\set-firebase-project.ps1 -ProjectId msec-4f21c -ApiKey AIza... -AppId 1:48:web:9f -AuthDomain msec-4f21c.firebaseapp.com'
        exit 1
    }
}

# Explicit parameters always win over anything parsed.
if ($raw) {
    if (-not $ProjectId)         { $ProjectId         = Get-Field $raw "projectId" }
    if (-not $ApiKey)            { $ApiKey            = Get-Field $raw "apiKey" }
    if (-not $AppId)             { $AppId             = Get-Field $raw "appId" }
    if (-not $AuthDomain)        { $AuthDomain        = Get-Field $raw "authDomain" }
    if (-not $StorageBucket)     { $StorageBucket     = Get-Field $raw "storageBucket" }
    if (-not $MessagingSenderId) { $MessagingSenderId = Get-Field $raw "messagingSenderId" }
    $MeasurementId = Get-Field $raw "measurementId"
} else {
    $MeasurementId = ""
}

if (-not $AuthDomain -and $ProjectId) { $AuthDomain = "$ProjectId.firebaseapp.com" }

# --- Refuse to write a half-empty config -------------------------------------
$missing = @()
if (-not $ProjectId)  { $missing += "projectId" }
if (-not $ApiKey)     { $missing += "apiKey" }
if (-not $AppId)      { $missing += "appId" }

if ($missing.Count -gt 0) {
    Write-Host "ERROR: couldn't find $($missing -join ', ') in the $source." -ForegroundColor Red
    Write-Host ""
    Write-Host "Expected something like:" -ForegroundColor Yellow
    Write-Host '  const firebaseConfig = {'
    Write-Host '    apiKey: "AIzaSy...",'
    Write-Host '    authDomain: "msec-4f21c.firebaseapp.com",'
    Write-Host '    projectId: "msec-4f21c",'
    Write-Host '    appId: "1:482910374651:web:9f3a2b"'
    Write-Host '  };'
    exit 1
}

# --- Confirm before changing where the vault syncs ---------------------------
$appConfigPath = "firebase-applet-config.json"
$old = if (Test-Path $appConfigPath) { (Get-Content $appConfigPath -Raw | ConvertFrom-Json).projectId } else { "(none)" }

Write-Host ""
Write-Host "Read from the $source." -ForegroundColor DarkGray
Write-Host "  from : $old" -ForegroundColor DarkGray
Write-Host "  to   : $ProjectId" -ForegroundColor Green
Write-Host "  auth : $AuthDomain" -ForegroundColor DarkGray
Write-Host "  db   : $DatabaseId" -ForegroundColor DarkGray
Write-Host ""

if ($old -ne "(none)" -and $old -ne $ProjectId) {
    Write-Host "This changes which project your devices sync with. Vault data is NOT copied" -ForegroundColor Yellow
    Write-Host "across - each device re-uploads its own local vault on first sign-in." -ForegroundColor Yellow
    $answer = Read-Host "Continue? (y/N)"
    if ($answer -ne "y") { Write-Host "Cancelled."; exit 0 }
}

# --- Write the app config -----------------------------------------------------
$appConfig = [ordered]@{
    projectId           = $ProjectId
    appId               = $AppId
    apiKey              = $ApiKey
    authDomain          = $AuthDomain
    firestoreDatabaseId = $DatabaseId
    storageBucket       = $StorageBucket
    messagingSenderId   = $MessagingSenderId
    measurementId       = $MeasurementId
}
($appConfig | ConvertTo-Json -Depth 10) | Set-Content $appConfigPath -NoNewline
Add-Content $appConfigPath "`n"
Write-Host "Updated $appConfigPath" -ForegroundColor Green

# --- Write the extension config ----------------------------------------------
$extPath = "extension/config.js"
if (Test-Path $extPath) {
    $ext = Get-Content $extPath -Raw
    $ext = $ext -replace 'FIREBASE_API_KEY:\s*"[^"]*"',      "FIREBASE_API_KEY: `"$ApiKey`""
    $ext = $ext -replace 'FIREBASE_PROJECT_ID:\s*"[^"]*"',   "FIREBASE_PROJECT_ID: `"$ProjectId`""
    $ext = $ext -replace 'FIRESTORE_DATABASE_ID:\s*"[^"]*"', "FIRESTORE_DATABASE_ID: `"$DatabaseId`""
    Set-Content $extPath $ext -NoNewline
    Write-Host "Updated $extPath" -ForegroundColor Green
}

# --- Pin the CLI at the same project -----------------------------------------
$rc = [ordered]@{ projects = [ordered]@{ default = $ProjectId } }
($rc | ConvertTo-Json -Depth 10) | Set-Content ".firebaserc" -NoNewline
Add-Content ".firebaserc" "`n"
Write-Host "Updated .firebaserc" -ForegroundColor Green

Write-Host ""
Write-Host "Next, in the NEW project:" -ForegroundColor Cyan
Write-Host "  1. Authentication -> Sign-in method -> enable Google"
Write-Host "  2. Authentication -> Settings -> Authorized domains -> add 0mattsmith.github.io"
Write-Host "  3. Firestore -> create the database"
Write-Host "  4. firebase deploy --only firestore:rules"
Write-Host "  5. Recreate the OAuth clients - they belong to the project, so the old ones"
Write-Host "     do not carry over. Then: .\set-oauth-client.ps1 ..."
Write-Host ""
Write-Host "Then rebuild, because these values are baked in at build time:" -ForegroundColor Cyan
Write-Host "  .\push.ps1 ""Move to the MSec Firebase project"" -Release"
Write-Host ""
