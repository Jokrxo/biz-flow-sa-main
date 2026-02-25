@echo off
echo Setting up Git repository for Rigel Business...
echo.

REM Check if Git is installed
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed or not in PATH
    echo Please install Git from: https://git-scm.com/downloads
    pause
    exit /b 1
)

echo Git found! Initializing repository...
echo.

REM Initialize Git repository
git init
if %errorlevel% neq 0 (
    echo ERROR: Failed to initialize Git repository
    pause
    exit /b 1
)

echo Adding all files...
git add .
if %errorlevel% neq 0 (
    echo ERROR: Failed to add files
    pause
    exit /b 1
)

echo Creating initial commit...
git commit -m "Initial commit: Rigel Business accounting system with payment portal"
if %errorlevel% neq 0 (
    echo ERROR: Failed to create commit
    pause
    exit /b 1
)

echo.
echo SUCCESS! Git repository initialized!
echo.
echo Next steps:
echo 1. Create a repository on GitHub: https://github.com/new
echo 2. Run: git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
echo 3. Run: git push -u origin main
echo.
echo Or use GitHub Desktop for easier setup!
echo.
pause