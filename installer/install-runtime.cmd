@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "OMNIKES_HOME=%%~fI"
set "NODE_EXE=%OMNIKES_HOME%\runtime\node\node.exe"
set "INSTALL_SCRIPT=%OMNIKES_HOME%\installer\install-runtime.cjs"

if not exist "%NODE_EXE%" (
  echo ERREUR : runtime Node.js introuvable : "%NODE_EXE%"
  exit /b 1
)
if not exist "%INSTALL_SCRIPT%" (
  echo ERREUR : script d'installation introuvable : "%INSTALL_SCRIPT%"
  exit /b 1
)
if not exist "%OMNIKES_HOME%\runtime\postgresql\bin\initdb.exe" (
  echo ERREUR : runtime PostgreSQL introuvable sous "%OMNIKES_HOME%\runtime\postgresql\bin".
  exit /b 1
)

echo Installation du runtime local OmniKes...
"%NODE_EXE%" "%INSTALL_SCRIPT%"
if errorlevel 1 (
  echo ERREUR : la configuration PostgreSQL ou les migrations OmniKes ont echoue.
  exit /b 1
)
exit /b 0
