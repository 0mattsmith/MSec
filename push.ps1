# push.ps1 — commit, push, and optionally cut a versioned release of MSec.
#
# Usage (from the MSec folder):
#   .\push.ps1                                  -> commit + push only (no release)
#   .\push.ps1 "Fix the login bug"              -> your commit message
#   .\push.ps1 "New feature" -Release           -> bump patch (0.1.0 -> 0.1.1) and tag
#   .\push.ps1 "Big feature" -Release -Bump minor  -> 0.1.0 -> 0.2.0
#   .\push.ps1 "Breaking" -Release -Bump major     -> 0.1.0 -> 1.0.0
#   .\push.ps1 "Ship it" -Release -Version 1.2.3   -> set an exact version
#
# A release bumps the version in package.json AND src-tauri/tauri.conf.json,
# commits that, then pushes a v<version> tag. The tag triggers GitHub Actions
# to build Windows / macOS (Universal) / Linux installers plus an Android APK,
# all attached to one DRAFT release you then publish on GitHub.
#
# Note: -Release requires a clean build. Run 'npm run lint' first if unsure.

param(
    [Parameter(Position = 0)]
    [string]$Message = "Update MSec",

    [switch]$Release,

    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch",

    [string]$Version,

    [string]$RepoName = "MSec",
    [string]$GitHubUser = "0mattsmith",
    [string]$Branch = "main"
)

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

# Passing -Version implies a release, even without -Release.
$doRelease = $Release.IsPresent -or $Version

# --- Safety: never commit real secrets --------------------------------------
if (Test-Path ".env.local") {
    if (git ls-files .env.local) {
        Write-Host "ERROR: .env.local is tracked by git. Untrack it first:" -ForegroundColor Red
        Write-Host "  git rm --cached .env.local"
        exit 1
    }
}

# --- Version bump ------------------------------------------------------------
$newVersion = $null
if ($doRelease) {
    $pkgPath = "package.json"
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $current = $pkg.version

    if ($Version) {
        $newVersion = $Version
    } else {
        if ($current -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
            Write-Host "ERROR: version '$current' in package.json is not semver (x.y.z)." -ForegroundColor Red
            exit 1
        }
        $maj = [int]$Matches[1]; $min = [int]$Matches[2]; $pat = [int]$Matches[3]
        switch ($Bump) {
            "major" { $maj++; $min = 0; $pat = 0 }
            "minor" { $min++; $pat = 0 }
            "patch" { $pat++ }
        }
        $newVersion = "$maj.$min.$pat"
    }

    $tag = "v$newVersion"
    if (git tag -l $tag) {
        Write-Host "ERROR: tag $tag already exists. Pick another version." -ForegroundColor Red
        exit 1
    }

    Write-Host "Version: $current -> $newVersion" -ForegroundColor Cyan

    # package.json (preserve formatting style: 2-space indent)
    $pkg.version = $newVersion
    ($pkg | ConvertTo-Json -Depth 20) -replace '(?m)^(\s+)', '$1' | Set-Content $pkgPath -NoNewline
    Add-Content $pkgPath "`n"

    # tauri.conf.json — keeps installer/app versions in step
    $tauriPath = "src-tauri/tauri.conf.json"
    if (Test-Path $tauriPath) {
        $tauri = Get-Content $tauriPath -Raw | ConvertFrom-Json
        $tauri.version = $newVersion
        ($tauri | ConvertTo-Json -Depth 20) | Set-Content $tauriPath -NoNewline
        Add-Content $tauriPath "`n"
    }

    # Cargo.toml version line
    $cargoPath = "src-tauri/Cargo.toml"
    if (Test-Path $cargoPath) {
        (Get-Content $cargoPath) -replace '^version = ".*"$', "version = `"$newVersion`"" |
            Set-Content $cargoPath
    }
}

# --- Stage & commit ----------------------------------------------------------
git add -A
if (git status --porcelain) {
    $commitMsg = if ($doRelease) { "$Message (v$newVersion)" } else { $Message }
    git commit -m $commitMsg
    if ($LASTEXITCODE -ne 0) { Write-Host "Commit failed." -ForegroundColor Red; exit 1 }
    Write-Host "Committed: $commitMsg" -ForegroundColor Green
} else {
    Write-Host "Nothing new to commit - pushing existing commits." -ForegroundColor Yellow
}

# --- Remote ------------------------------------------------------------------
$url = "https://github.com/$GitHubUser/$RepoName.git"
if ((git remote) -contains "origin") { git remote set-url origin $url } else { git remote add origin $url }

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
    gh repo view "$GitHubUser/$RepoName" *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Creating repo $GitHubUser/$RepoName (public)..."
        gh repo create "$GitHubUser/$RepoName" --public --description "Secure, all-in-one password manager and authenticator."
        if ($LASTEXITCODE -ne 0) { Write-Host "Repo creation failed." -ForegroundColor Red; exit 1 }
    }
}

# --- Push --------------------------------------------------------------------
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Push failed. If the repo doesn't exist, create it at https://github.com/new" -ForegroundColor Red
    Write-Host "(name: $RepoName, public, no README), then run this script again."
    exit 1
}
Write-Host "Pushed to $url" -ForegroundColor Green

# --- Tag & release -----------------------------------------------------------
if ($doRelease) {
    git tag -a $tag -m "$Message"
    git push origin $tag
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Tag push failed - the code is pushed, but no release was triggered." -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "Released $tag - GitHub Actions is now building:" -ForegroundColor Green
    Write-Host "  - Windows (.msi/.exe), macOS Universal (.dmg), Linux (.deb/.AppImage)"
    Write-Host "  - Android debug APK (MSec-$tag-android-debug.apk)"
    Write-Host ""
    Write-Host "Takes ~15 min. Then publish the DRAFT release here:" -ForegroundColor Cyan
    Write-Host "  https://github.com/$GitHubUser/$RepoName/releases"
    Write-Host ""
    Write-Host "Progress: https://github.com/$GitHubUser/$RepoName/actions"
} else {
    Write-Host ""
    Write-Host "No release created. To cut one:  .\push.ps1 `"message`" -Release" -ForegroundColor DarkGray
}
Write-Host ""
