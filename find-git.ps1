# PowerShell script to find and test Git installation
Write-Host "Searching for Git installation..." -ForegroundColor Green

# Common Git installation paths
$gitPaths = @(
    "C:\Program Files\Git\bin\git.exe",
    "C:\Program Files (x86)\Git\bin\git.exe",
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Git\bin\git.exe"
)

$gitFound = $false
$gitPath = ""

foreach ($path in $gitPaths) {
    if (Test-Path $path) {
        Write-Host "Found Git at: $path" -ForegroundColor Green
        $gitPath = $path
        $gitFound = $true
        break
    }
}

if (-not $gitFound) {
    Write-Host "Git not found in common locations. Checking PATH..." -ForegroundColor Yellow
    
    # Check if git is in PATH
    try {
        $gitCheck = Get-Command git -ErrorAction Stop
        Write-Host "Found Git in PATH: $($gitCheck.Source)" -ForegroundColor Green
        $gitPath = "git"
        $gitFound = $true
    }
    catch {
        Write-Host "Git not found in PATH either." -ForegroundColor Red
    }
}

if ($gitFound) {
    Write-Host "Testing Git functionality..." -ForegroundColor Green
    
    try {
        # Test git version
        if ($gitPath -eq "git") {
            $version = & git --version 2>$null
        } else {
            $version = & $gitPath --version 2>$null
        }
        
        if ($version) {
            Write-Host "Git version: $version" -ForegroundColor Green
            Write-Host "Git is ready to use!" -ForegroundColor Green
            
            # Create a simple git command helper
            $helperScript = @"
# Git helper functions
function global:git-init {
    git init
    git add .
    git commit -m "Initial commit: ApexAccounts accounting system with payment portal"
}

function global:git-push {
    param([string]`$repoUrl)
    git remote add origin `$repoUrl
    git push -u origin main
}

Write-Host "Git helper functions loaded!" -ForegroundColor Green
Write-Host "Use 'git-init' to initialize repository" -ForegroundColor Yellow
Write-Host "Use 'git-push https://github.com/USERNAME/REPO.git' to push to GitHub" -ForegroundColor Yellow
"@
            
            $helperScript | Out-File -FilePath "git-helpers.ps1" -Encoding UTF8
            Write-Host "Created git-helpers.ps1 with helper functions" -ForegroundColor Green
            
        } else {
            Write-Host "Git found but not working properly" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "Error testing Git: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "Git not found. Please install Git from: https://git-scm.com/downloads" -ForegroundColor Red
}

Write-Host "Script completed." -ForegroundColor Green