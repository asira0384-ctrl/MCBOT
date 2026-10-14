@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
 echo Run 1-setup.bat first.
 pause
 exit /b 1
)
if not exist "node_modules\bedrock-protocol\package.json" (
 echo Run 1-setup.bat first.
 pause
 exit /b 1
)
call npm start
echo Bot stopped.
pause
