@echo off
setlocal EnableExtensions

REM Resolve the installation root from this script's actual location.
for %%I in ("%~dp0..") do set "OMNIKES_HOME=%%~fI"
set "APP_DIR=%OMNIKES_HOME%\app"
set "NODE_EXE=%OMNIKES_HOME%\runtime\node\node.exe"
set "NODE_ENV=production"

REM Configure user-writable directories and the log BEFORE any command writes to it.
set "OMNIKES_DATA_DIR=%LOCALAPPDATA%\OmniKes"
set "OMNIKES_CACHE_DIR=%OMNIKES_DATA_DIR%\cache"
set "OMNIKES_LOGS_DIR=%OMNIKES_DATA_DIR%\logs"
set "OMNIKES_TEMP_DIR=%OMNIKES_DATA_DIR%\temp"
if not exist "%OMNIKES_DATA_DIR%" mkdir "%OMNIKES_DATA_DIR%" 2>nul
if not exist "%OMNIKES_CACHE_DIR%" mkdir "%OMNIKES_CACHE_DIR%" 2>nul
if not exist "%OMNIKES_LOGS_DIR%" mkdir "%OMNIKES_LOGS_DIR%" 2>nul
if not exist "%OMNIKES_TEMP_DIR%" mkdir "%OMNIKES_TEMP_DIR%" 2>nul
set "LOG_FILE=%OMNIKES_LOGS_DIR%\launcher.log"
set "NEXT_CACHE_DIR=%OMNIKES_CACHE_DIR%"

echo [%date% %time%] OmniKes Launcher starting >> "%LOG_FILE%"
echo [%time%] OMNIKES_HOME=%OMNIKES_HOME% >> "%LOG_FILE%"
echo [%time%] APP_DIR=%APP_DIR% >> "%LOG_FILE%"

if not exist "%NODE_EXE%" (
    echo [%time%] ERROR: Node.js runtime not found: %NODE_EXE% >> "%LOG_FILE%"
    echo ERREUR : runtime Node.js introuvable. Reinstallez OmniKes.
    echo Journal : "%LOG_FILE%"
    pause
    exit /b 1
)
if not exist "%APP_DIR%\server.js" (
    echo [%time%] ERROR: server.js missing: %APP_DIR%\server.js >> "%LOG_FILE%"
    echo ERREUR : serveur OmniKes introuvable. Reinstallez OmniKes.
    echo Journal : "%LOG_FILE%"
    pause
    exit /b 1
)

REM Prepare the writable Next.js directory on first launch.
if not exist "%OMNIKES_DATA_DIR%\.next" (
    echo [%time%] Preparing user-writable environment... >> "%LOG_FILE%"
    if not exist "%OMNIKES_HOME%\installer\prepare-user-env.cjs" (
        echo [%time%] ERROR: prepare-user-env.cjs missing >> "%LOG_FILE%"
        echo ERREUR : fichier de preparation introuvable.
        pause
        exit /b 1
    )
    "%NODE_EXE%" "%OMNIKES_HOME%\installer\prepare-user-env.cjs" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        echo [%time%] ERROR: Failed to prepare user environment >> "%LOG_FILE%"
        echo ERREUR : preparation de l'environnement impossible.
        echo Journal : "%LOG_FILE%"
        pause
        exit /b 1
    )
)

REM If the app is already responding, just open it.
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    echo [%time%] OmniKes already responds on port 3000 >> "%LOG_FILE%"
    start "" "http://127.0.0.1:3000"
    exit /b 0
)

REM Check the bundled PostgreSQL Windows service and its TCP listener.
sc.exe query OmniKesPostgreSQL >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo [%time%] ERROR: Windows service OmniKesPostgreSQL is not installed >> "%LOG_FILE%"
    echo ERREUR : le service PostgreSQL OmniKesPostgreSQL n'est pas installe.
    echo Relancez l'installation d'OmniKes en tant qu'administrateur.
    echo Journal : "%LOG_FILE%"
    pause
    exit /b 1
)
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient; try { $a=$c.BeginConnect('127.0.0.1',5432,$null,$null); if(-not $a.AsyncWaitHandle.WaitOne(3000)){exit 1}; $c.EndConnect($a); exit 0 } catch { exit 1 } finally { $c.Dispose() }" >nul 2>&1
if errorlevel 1 (
    echo [%time%] ERROR: PostgreSQL service exists but port 5432 is not accepting connections >> "%LOG_FILE%"
    echo ATTENTION : PostgreSQL ne repond pas sur le port 5432.
    echo Verifiez le service OmniKesPostgreSQL et le journal d'installation.
    echo Journal : "%LOG_FILE%"
    pause
    exit /b 1
)

echo [%time%] Starting OmniKes server... >> "%LOG_FILE%"
cd /d "%APP_DIR%" || (
    echo [%time%] ERROR: Cannot enter application directory >> "%LOG_FILE%"
    echo ERREUR : impossible d'acceder au dossier de l'application.
    pause
    exit /b 1
)
start "" /B "%NODE_EXE%" "%APP_DIR%\server.js" >> "%LOG_FILE%" 2>&1

set "MAX_WAIT=60"
set "WAIT_COUNT=0"
:wait_loop
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto server_ready
if %WAIT_COUNT% geq %MAX_WAIT% goto server_timeout
timeout /t 1 /nobreak >nul
set /a WAIT_COUNT+=1
goto wait_loop

:server_timeout
echo [%time%] ERROR: Server did not start within %MAX_WAIT% seconds >> "%LOG_FILE%"
echo ERREUR : OmniKes n'a pas demarre dans le delai imparti.
echo Consultez le journal : "%LOG_FILE%"
pause
exit /b 1

:server_ready
echo [%time%] Server is ready; opening browser >> "%LOG_FILE%"
start "" "http://127.0.0.1:3000"
endlocal
exit /b 0
