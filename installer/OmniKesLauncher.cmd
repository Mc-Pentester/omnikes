@echo off
setlocal
set "OMNIKES_HOME=%~dp0"
set "NODE_EXE=%OMNIKES_HOME%runtime\node\node.exe"
set "APP_DIR=%OMNIKES_HOME%app"
set "NODE_ENV=production"
set "PORT=3000"

if not exist "%NODE_EXE%" (
  powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Le runtime Node.js d''OmniKes est introuvable. Reparez l''installation.','OmniKes',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null" >nul 2>&1
  exit /b 1
)
if not exist "%APP_DIR%\server.js" exit /b 1

rem Reuse the running local app instead of spawning duplicate server processes.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:3000' -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto open_browser

cd /d "%APP_DIR%"
start "" /min "%NODE_EXE%" "%APP_DIR%\server.js"

rem Wait until Next.js responds; do not assume a fixed two-second startup time.
for /L %%i in (1,1,45) do (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:3000' -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto open_browser
  timeout /t 1 /nobreak >nul
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('OmniKes n''a pas demarre dans le delai prevu. Verifiez le journal PostgreSQL dans ProgramData\\OmniKes.','OmniKes',[System.Windows.MessageBoxButton]::OK,[System.Windows.MessageBoxImage]::Error) | Out-Null" >nul 2>&1
exit /b 1

:open_browser
start "" "http://127.0.0.1:3000"
exit /b 0
