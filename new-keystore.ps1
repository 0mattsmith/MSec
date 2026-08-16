# new-keystore.ps1 — create the Android signing keystore for MSec and print
# the GitHub secrets to paste in. Run this ONCE.
#
#   .\new-keystore.ps1
#
# It writes msec-keystore.jks (or .pfx) to this folder — that file is your
# app's identity. Keep it safe and OUT of git (.gitignore covers it). If you
# lose it, future builds can't upgrade an installed MSec; users must uninstall
# and reinstall first.
#
# Uses Java's keytool if available; otherwise falls back to a pure-PowerShell
# PKCS#12 keystore so you don't have to download a JDK.

param(
    [string]$Alias = "msec",
    [string]$Password
)

Set-Location $PSScriptRoot

if (-not $Password) {
    $secure = Read-Host "Choose a keystore password (min 6 chars, save it in MSec!)" -AsSecureString
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
if ($Password.Length -lt 6) { Write-Host "Password must be at least 6 characters." -ForegroundColor Red; exit 1 }

$keytool = Get-Command keytool -ErrorAction SilentlyContinue
$storeFile = $null

if ($keytool) {
    Write-Host "Using Java keytool..." -ForegroundColor Cyan
    $storeFile = Join-Path $PSScriptRoot "msec-keystore.jks"
    if (Test-Path $storeFile) { Write-Host "$storeFile already exists - delete it first if you really want a new one." -ForegroundColor Red; exit 1 }
    & keytool -genkeypair -v `
        -keystore $storeFile `
        -alias $Alias `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $Password -keypass $Password `
        -dname "CN=MSec, OU=MSec, O=MSec, L=, S=, C=GB"
    if ($LASTEXITCODE -ne 0) { Write-Host "keytool failed." -ForegroundColor Red; exit 1 }
} else {
    Write-Host "Java keytool not found - creating a PKCS#12 keystore with PowerShell instead." -ForegroundColor Cyan
    $storeFile = Join-Path $PSScriptRoot "msec-keystore.pfx"
    if (Test-Path $storeFile) { Write-Host "$storeFile already exists - delete it first if you really want a new one." -ForegroundColor Red; exit 1 }

    $cert = New-SelfSignedCertificate `
        -Subject "CN=MSec, O=MSec" `
        -FriendlyName $Alias `
        -KeyAlgorithm RSA -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears(30) `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -KeyExportPolicy Exportable `
        -Type Custom -KeyUsage DigitalSignature

    $securePw = ConvertTo-SecureString -String $Password -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $storeFile -Password $securePw | Out-Null
    Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force
    Write-Host "Created $storeFile" -ForegroundColor Green
}

# --- Encode for GitHub secrets ----------------------------------------------
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($storeFile))
$b64File = Join-Path $PSScriptRoot "keystore-base64.txt"
Set-Content -Path $b64File -Value $b64 -NoNewline
$b64 | Set-Clipboard

Write-Host ""
Write-Host "==================== NEXT STEPS ====================" -ForegroundColor Cyan
Write-Host "Add these 3 secrets at:" -ForegroundColor Cyan
Write-Host "  https://github.com/0mattsmith/MSec/settings/secrets/actions"
Write-Host ""
Write-Host "  ANDROID_KEYSTORE_BASE64   <- already copied to your clipboard"
Write-Host "                               (also saved to keystore-base64.txt)"
Write-Host "  ANDROID_KEYSTORE_PASSWORD <- the password you just chose"
Write-Host "  ANDROID_KEY_ALIAS         <- $Alias"
Write-Host ""
Write-Host "Then delete keystore-base64.txt, and back up $([IO.Path]::GetFileName($storeFile)) somewhere safe." -ForegroundColor Yellow
Write-Host "Both files are gitignored - never commit them." -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
