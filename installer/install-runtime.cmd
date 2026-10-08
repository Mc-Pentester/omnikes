@echo off
setlocal
set "OMNIKES_HOME=%~dp.."
set "NODE_EXE=%OMNIKES_HOME%runtime\node\node.exe"
if not exist "%NODE_EXE%" exit /b 1
"%NODE_EXE%" "%OMNIKES_HOME%installer\install-runtime.cjs"
if errorlevel 1 exit /b 1
endlocal
