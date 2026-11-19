@echo off
cd /d "%~dp0"
REM Apply the native source fix before rebuilding the EXE.
node "..\src\hotfix.js" --native
if errorlevel 1 exit /b 1
zig rc /fo resources.res resources.rc
if errorlevel 1 exit /b 1
zig c++ -target x86_64-windows-gnu -std=c++17 -O1 -municode -Wl,--subsystem,windows -Ivendor main.cpp resources.res -lwinhttp -lgdiplus -lgdi32 -lshell32 -lole32 -lshlwapi -lcomdlg32 -lcomctl32 -lwinmm -luuid -o Asira-Native-v6.exe
