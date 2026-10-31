@echo off
setlocal
cd /d "%~dp0"
title TerraField - local website
set "TERRA_NODE=%~dp0runtime\node.exe"
if not exist "%TERRA_NODE%" set "TERRA_NODE=node"
"%TERRA_NODE%" -e "if (+process.versions.node.split('.')[0] !== 24) process.exit(1)" >nul 2>&1
if errorlevel 1 (
  echo TerraField needs Node.js version 24. Install Node.js 24 LTS and reopen this window.
  echo Download only from https://nodejs.org/ and extract the complete project ZIP.
  pause
  exit /b 1
)
if not exist "%~dp0node-server\app.js" (
  echo Project files not found. Extract the complete ZIP to a writable folder.
  pause
  exit /b 1
)
"%TERRA_NODE%" "%~dp0node-server\app.js"
set "TERRA_EXIT=%errorlevel%"
if not "%TERRA_EXIT%"=="0" echo TerraField could not continue. See the message above and README.md.
pause
exit /b %TERRA_EXIT%
