@echo off
setlocal
set "OMNIKES_HOME=%~dp0"
set "NODE_EXE=%OMNIKES_HOME%runtime\node\node.exe"
set "APP_DIR=%OMNIKES_HOME%app"
set "NODE_ENV=production"
if not exist "%NODE_EXE%" exit /b 1
cd /d "%APP_DIR%"
start "" "%NODE_EXE%" "%APP_DIR%\server.js"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:3000"
endlocal
