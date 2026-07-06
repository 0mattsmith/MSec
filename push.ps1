# push.ps1 — commit everything and push MSec to GitHub in one step.
#
# Usage (from the MSec folder):
#   .\push.ps1                                  -> uses the default message below
#   .\push.ps1 "Add icon folders to dashboard"  -> your message overrides the default
#
# Optional:
#   .\push.ps1 "msg" -RepoName MSec2            -> push to a differently named repo
#
# If the GitHub CLI (gh) is installed and the repo doesn't exist yet, the
# script creates it (public) automatically. Without gh, create the repo once
# at https://github.com/new and the script handles everything else.

param(
    [Parameter(Position = 0)]
    [string]$Message = "Update MSec",

    [string]$RepoName = "MSec",
    [string]$GitHubUser = "0mattsmith",
    [string]$Branch = "main"
)

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

# --- Safety check: never commit real secrets -------------------------------
if (Test-Path ".env.local") {
    $tracked = git ls-files .env.local
    if ($tracked) {
        Write-Host "ERROR: .env.local is tracked by git. Untrack it before pushing:" -ForegroundColor Red
        Write-Host "  git rm --cached .env.local"
        exit 1
    }
}

# --- Stage & commit ---------------------------------------------------------
git add -A
$pending = git status --porcelain
if ($pending) {
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) { Write-Host "Commit failed." -ForegroundColor Red; exit 1 }
    Write-Host "Committed: $Message" -ForegroundColor Green
} else {
    Write-Host "Nothing new to commit - pushing existing commits." -ForegroundColor Yellow
}

# --- Point origin at the target repo ----------------------------------------
$url = "https://github.com/$GitHubUser/$RepoName.git"
$remotes = git remote
if ($remotes -contains "origin") {
    git remote set-url origin $url
} else {
    git remote add origin $url
}

# --- Create the repo if gh is available and it doesn't exist ----------------
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
    gh repo view "$GitHubUser/$RepoName" *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Repo $GitHubUser/$RepoName not found - creating it (public)..."
        gh repo create "$GitHubUser/$RepoName" --public --description "Secure, all-in-one password manager and authenticator with zero-knowledge encryption."
        if ($LASTEXITCODE -ne 0) { Write-Host "Repo creation failed." -ForegroundColor Red; exit 1 }
    }
}

# --- Push --------------------------------------------------------------------
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Push failed. If the repo doesn't exist yet, create it at:" -ForegroundColor Red
    Write-Host "  https://github.com/new  (name: $RepoName, public, no README)"
    Write-Host "then run this script again."
    exit 1
}

Write-Host ""
Write-Host "Pushed to $url" -ForegroundColor Green
