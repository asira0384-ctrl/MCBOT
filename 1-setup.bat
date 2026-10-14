@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 24 LTS, then run this file again.
 pause
 exit /b 1
)
node -e "if(process.versions.node.split('.')[0]!=='24')process.exit(1)"
if errorlevel 1 (
 echo This project requires Node.js 24 LTS.
 pause
 exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
 echo Install Git for Windows, then run this file again.
 pause
 exit /b 1
)
if not exist ".env" (
 powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-setup.ps1"
 if errorlevel 1 (
  pause
  exit /b 1
 )
) else (
 echo Existing .env will be kept. Edit it to change accounts.
)
set "GIT_CONFIG_COUNT=1"
set "GIT_CONFIG_KEY_0=url.https://github.com/.insteadOf"
set "GIT_CONFIG_VALUE_0=ssh://git@github.com/"
call npm ci --omit=dev --ignore-scripts
if errorlevel 1 (
 pause
 exit /b 1
)
node scripts\prepare-raknet.js
if errorlevel 1 (
 pause
 exit /b 1
)
echo Setup complete. Run 2-start.bat.
pause
