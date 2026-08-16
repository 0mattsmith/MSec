# copy-rules.ps1 — copy firestore.rules to the clipboard for pasting into
# the Firebase Console (Firestore Database -> Rules -> paste -> Publish).
#
# Usage:  .\copy-rules.ps1

Set-Location $PSScriptRoot

$rulesPath = Join-Path $PSScriptRoot "firestore.rules"

if (-not (Test-Path $rulesPath)) {
    Write-Host "firestore.rules not found in $PSScriptRoot" -ForegroundColor Red
    exit 1
}

Get-Content $rulesPath -Raw | Set-Clipboard

$lines = (Get-Content $rulesPath).Count
$bytes = (Get-Item $rulesPath).Length

Write-Host ""
Write-Host "firestore.rules copied to clipboard ($lines lines, $bytes bytes)." -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. https://console.firebase.google.com  ->  project golden-fountain-w6tp2"
Write-Host "  2. Firestore Database -> Rules tab"
Write-Host "  3. Check the database selector shows 'ai-studio-1df2f1e2-43f2-47f6-aed6-5f067420f398'"
Write-Host "     (NOT '(default)') - MSec uses a named database."
Write-Host "  4. Select all in the editor, paste, then Publish."
Write-Host ""
