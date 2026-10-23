@echo off
setlocal

REM Get the installation root (OmniKesLauncher.cmd is in installer/ subdirectory)
set "OMNIKES_HOME=%~dp0.."
set "APP_DIR=%OMNIKES_HOME%\app"
set "NODE_EXE=%OMNIKES_HOME%\runtime\node\node.exe"
set "NODE_ENV=production"

REM Configure user-writable directories
set "OMNIKES_DATA_DIR=%LOCALAPPDATA%\OmniKes"
set "OMNIKES_CACHE_DIR=%OMNIKES_DATA_DIR%\cache"
set "OMNIKES_LOGS_DIR=%OMNIKES_DATA_DIR%\logs"
set "OMNIKES_TEMP_DIR=%OMNIKES_DATA_DIR%\temp"

REM Create directories if they don't exist
if not exist "%OMNIKES_DATA_DIR%" mkdir "%OMNIKES_DATA_DIR%"
if not exist "%OMNIKES_CACHE_DIR%" mkdir "%OMNIKES_CACHE_DIR%"
if not exist "%OMNIKES_LOGS_DIR%" mkdir "%OMNIKES_LOGS_DIR%"
if not exist "%OMNIKES_TEMP_DIR%" mkdir "%OMNIKES_TEMP_DIR%"

REM Set environment variables for Next.js cache
set "NEXT_CACHE_DIR=%OMNIKES_CACHE_DIR%"

REM Prepare user-writable environment on first launch
if not exist "%OMNIKES_DATA_DIR%\.next" (
    echo [%time%] Preparing user-writable environment... >> "%LOG_FILE%"
    "%NODE_EXE%" "%OMNIKES_HOME%\installer\prepare-user-env.cjs" >> "%LOG_FILE%" 2>&1
    if %errorlevel% neq 0 (
        echo [%time%] ERROR: Failed to prepare user environment >> "%LOG_FILE%"
        echo ERROR: Impossible de préparer l'environnement utilisateur.
        echo Consultez le journal: %LOG_FILE%
        pause
        exit /b 1
    )
)

REM Log file
set "LOG_FILE=%OMNIKES_LOGS_DIR%\launcher-%date:~-4,4%%date:~-7,2%%date:~-10,2%.log"

REM Log startup
echo [%time%] OmniKes Launcher starting >> "%LOG_FILE%"
echo [%time%] OMNIKES_HOME=%OMNIKES_HOME% >> "%LOG_FILE%"
echo [%time%] APP_DIR=%APP_DIR% >> "%LOG_FILE%"

REM Check if Node.js runtime exists
if not exist "%NODE_EXE%" (
    echo [%time%] ERROR: Node.js runtime not found at %NODE_EXE% >> "%LOG_FILE%"
    echo ERROR: Node.js runtime not found. Please reinstall OmniKes.
    pause
    exit /b 1
)

REM Check if application directory exists
if not exist "%APP_DIR%" (
    echo [%time%] ERROR: Application directory not found at %APP_DIR% >> "%LOG_FILE%"
    echo ERROR: Application directory not found. Please reinstall OmniKes.
    pause
    exit /b 1
)

REM Check if OmniKes is already running (port 3000)
netstat -ano | findstr ":3000" >nul 2>&1
if %errorlevel% equ 0 (
    echo [%time%] OmniKes is already running on port 3000 >> "%LOG_FILE%"
    echo OmniKes est déjà en cours d'exécution.
    start "" "http://127.0.0.1:3000"
    exit /b 0
)

REM Check if PostgreSQL is running (port 5432)
netstat -ano | findstr ":5432" >nul 2>&1
if %errorlevel% neq 0 (
    echo [%time%] WARNING: PostgreSQL is not running on port 5432 >> "%LOG_FILE%"
    echo ATTENTION: Le service PostgreSQL n'est pas disponible.
    echo Vérifiez le service OmniKesPostgreSQL ou contactez le support.
    pause
    exit /b 1
)

REM Start the application server
echo [%time%] Starting OmniKes server... >> "%LOG_FILE%"
cd /d "%APP_DIR%"
start "" /B "%NODE_EXE%" "%APP_DIR%\server.js" >> "%LOG_FILE%" 2>&1

REM Wait for server to be ready (max 60 seconds)
set "MAX_WAIT=60"
set "WAIT_COUNT=0"
:wait_loop
if %WAIT_COUNT% geq %MAX_WAIT% (
    echo [%time%] ERROR: Server did not start within %MAX_WAIT% seconds >> "%LOG_FILE%"
    echo ERROR: OmniKès n'a pas pu démarrer dans le délai imparti.
    echo Consultez le journal: %LOG_FILE%
    pause
    exit /b 1
)

REM Check if server is responding
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo [%time%] Server is ready >> "%LOG_FILE%"
    goto server_ready
)

timeout /t 1 /nobreak >nul
set /a WAIT_COUNT+=1
goto wait_loop

:server_ready
REM Open browser
echo [%time%] Opening browser... >> "%LOG_FILE%"
start "" "http://127.0.0.1:3000"

echo [%time%] OmniKes Launcher completed successfully >> "%LOG_FILE%"
endlocal
