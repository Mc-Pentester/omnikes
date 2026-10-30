@echo off
setlocal EnableExtensions

REM Get the installation root (OmniKesLauncher.cmd is in installer/ subdirectory)
set "OMNIKES_HOME=%~dp0.."
set "APP_DIR=%OMNIKES_HOME%\\app"
set "NODE_EXE=%OMNIKES_HOME%\\runtime\\node\\node.exe"
set "PG_READY=%OMNIKES_HOME%\\runtime\\postgresql\\bin\\pg_isready.exe"
set "NODE_ENV=production"

REM Configure user-writable directories and initialize logging before any operation.
set "OMNIKES_DATA_DIR=%LOCALAPPDATA%\\OmniKes"
set "OMNIKES_CACHE_DIR=%OMNIKES_DATA_DIR%\\cache"
set "OMNIKES_LOGS_DIR=%OMNIKES_DATA_DIR%\\logs"
set "OMNIKES_TEMP_DIR=%OMNIKES_DATA_DIR%\\temp"
if not exist "%OMNIKES_DATA_DIR%" mkdir "%OMNIKES_DATA_DIR%"
if not exist "%OMNIKES_CACHE_DIR%" mkdir "%OMNIKES_CACHE_DIR%"
if not exist "%OMNIKES_LOGS_DIR%" mkdir "%OMNIKES_LOGS_DIR%"
if not exist "%OMNIKES_TEMP_DIR%" mkdir "%OMNIKES_TEMP_DIR%"
set "LOG_FILE=%OMNIKES_LOGS_DIR%\\launcher-%date:~-4,4%%date:~-7,2%%date:~-10,2%.log"
set "NEXT_CACHE_DIR=%OMNIKES_CACHE_DIR%"

echo [%date% %time%] OmniKes Launcher starting >> "%LOG_FILE%"
echo [%time%] OMNIKES_HOME=%OMNIKES_HOME% >> "%LOG_FILE%"

if not exist "%NODE_EXE%" (
    echo [%time%] ERROR: Node.js runtime not found at %NODE_EXE% >> "%LOG_FILE%"
    echo ERROR: Runtime Node.js introuvable. Reinstallez OmniKes.
    pause
    exit /b 1
)
if not exist "%APP_DIR%\\server.js" (
    echo [%time%] ERROR: Application server not found at %APP_DIR% >> "%LOG_FILE%"
    echo ERROR: Application OmniKes introuvable. Reinstallez OmniKes.
    pause
    exit /b 1
)
if not exist "%PG_READY%" (
    echo [%time%] ERROR: PostgreSQL readiness tool missing at %PG_READY% >> "%LOG_FILE%"
    echo ERROR: Runtime PostgreSQL incomplet. Reinstallez OmniKes.
    pause
    exit /b 1
)

REM Prepare user-writable environment on first launch.
if not exist "%OMNIKES_DATA_DIR%\\.next" (
    echo [%time%] Preparing user-writable environment... >> "%LOG_FILE%"
    "%NODE_EXE%" "%OMNIKES_HOME%\\installer\\prepare-user-env.cjs" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        echo [%time%] ERROR: Failed to prepare user environment >> "%LOG_FILE%"
        echo ERROR: Impossible de préparer l'environnement utilisateur.
        echo Consultez le journal: %LOG_FILE%
        pause
        exit /b 1
    )
)

REM Avoid starting a second application instance.
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo [%time%] OmniKes is already listening on port 3000 >> "%LOG_FILE%"
    start "" "http://127.0.0.1:3000"
    exit /b 0
)

REM Require the Windows service to exist, then request startup if it is stopped.
sc.exe query OmniKesPostgreSQL >nul 2>&1
if errorlevel 1 (
    echo [%time%] ERROR: Windows service OmniKesPostgreSQL is not registered. >> "%LOG_FILE%"
    echo ERREUR: Le service PostgreSQL OmniKesPostgreSQL est introuvable.
    echo Reexecutez le programme d'installation OmniKes en administrateur.
    echo Consultez le journal: %LOG_FILE%
    pause
    exit /b 1
)

sc.exe start OmniKesPostgreSQL >> "%LOG_FILE%" 2>&1
REM ERRORLEVEL 1056 means the service is already running; readiness is checked below.

REM Wait up to 45 seconds for PostgreSQL itself, not merely an open TCP port.
set "WAIT_COUNT=0"
:postgres_wait
"%PG_READY%" -h 127.0.0.1 -p 5432 -t 2 >nul 2>&1
if not errorlevel 1 goto postgres_ready
if %WAIT_COUNT% geq 45 (
    echo [%time%] ERROR: PostgreSQL service did not become ready. >> "%LOG_FILE%"
    echo ERREUR: PostgreSQL ne demarre pas. Consultez le journal et le service Windows.
    echo Consultez le journal: %LOG_FILE%
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul
set /a WAIT_COUNT+=1
goto postgres_wait

:postgres_ready
echo [%time%] PostgreSQL service is ready on 127.0.0.1:5432 >> "%LOG_FILE%"

REM Start the application server.
echo [%time%] Starting OmniKes server... >> "%LOG_FILE%"
cd /d "%APP_DIR%"
start "" /B "%NODE_EXE%" "%APP_DIR%\\server.js" >> "%LOG_FILE%" 2>&1

REM Wait for server health check (max 60 seconds).
set "MAX_WAIT=60"
set "WAIT_COUNT=0"
:wait_loop
if %WAIT_COUNT% geq %MAX_WAIT% (
    echo [%time%] ERROR: Server did not start within %MAX_WAIT% seconds >> "%LOG_FILE%"
    echo ERROR: OmniKes n'a pas pu démarrer dans le délai imparti.
    echo Consultez le journal: %LOG_FILE%
    pause
    exit /b 1
)
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto server_ready
timeout /t 1 /nobreak >nul
set /a WAIT_COUNT+=1
goto wait_loop

:server_ready
echo [%time%] OmniKes server is ready >> "%LOG_FILE%"
start "" "http://127.0.0.1:3000"
echo [%time%] OmniKes Launcher completed successfully >> "%LOG_FILE%"
endlocal
