Write-Host "=== Push to GitHub: Godiemen/biz-flow-sa ===" -ForegroundColor Cyan

function Ensure-Git {
  try {
    $v = (& git --version) 2>$null
    if (-not $v) { throw "Git not available" }
    Write-Host "Git detected: $v" -ForegroundColor Green
  } catch {
    Write-Host "ERROR: Git is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Install from https://git-scm.com/downloads and re-run this script." -ForegroundColor Yellow
    exit 1
  }
}

function Ensure-Repo {
  $inside = (& git rev-parse --is-inside-work-tree) 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $inside) {
    Write-Host "Initializing Git repository..." -ForegroundColor Yellow
    & git init
    if ($LASTEXITCODE -ne 0) { Write-Host "Failed to init repo" -ForegroundColor Red; exit 1 }
  } else {
    Write-Host "Repository detected." -ForegroundColor Green
  }
}

function Ensure-User {
  $name = (& git config user.name) 2>$null
  $email = (& git config user.email) 2>$null
  if (-not $name -or -not $email) {
    Write-Host "Setting local git user identity..." -ForegroundColor Yellow
    & git config user.name "Rigel Business User"
    & git config user.email "user@example.com"
  }
}

function Commit-Changes {
  Write-Host "Staging files..." -ForegroundColor Yellow
  & git add -A
  $status = (& git status --porcelain) 2>$null
  if ($status) {
    Write-Host "Creating commit..." -ForegroundColor Yellow
    & git commit -m "feat: initial push of biz-flow-sa"
  } else {
    Write-Host "No changes to commit." -ForegroundColor Green
  }
}

function Configure-Remote {
  $remote = (& git remote) 2>$null
  $url = "https://github.com/Godiemen/biz-flow-sa.git"
  if ($remote -match "origin") {
    Write-Host "Updating remote origin URL..." -ForegroundColor Yellow
    & git remote set-url origin $url
  } else {
    Write-Host "Adding remote origin..." -ForegroundColor Yellow
    & git remote add origin $url
  }
  Write-Host "Remote set to: $url" -ForegroundColor Green
}

function Push-Main {
  Write-Host "Switching to main branch..." -ForegroundColor Yellow
  & git branch -M main
  Write-Host "Pushing to GitHub (may prompt for GitHub login/token)..." -ForegroundColor Yellow
  & git push -u origin main
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed. If prompted credentials didn't work, create a GitHub token and use it as password." -ForegroundColor Red
    Write-Host "Create token: https://github.com/settings/tokens (scope: repo)" -ForegroundColor Yellow
    exit 1
  }
  Write-Host "Push succeeded." -ForegroundColor Green
}

Ensure-Git
Ensure-Repo
Ensure-User
Commit-Changes
Configure-Remote
Push-Main

Write-Host "=== Completed ===" -ForegroundColor Cyan