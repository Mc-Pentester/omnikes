@echo off
setlocal
set "OMNIKES_HOME=%~dp.."
set "NODE_EXE=%OMNIKES_HOME%runtime\node\node.exe"
if not exist "%NODE_EXE%" exit /b 0
"%NODE_EXE%" "%OMNIKES_HOME%installer\uninstall-runtime.cjs" "%OMNIKES_HOME%"
endlocal
exit /b 0
