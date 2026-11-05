param(
  [Parameter(Mandatory = $true)]
  [string]$SetupExe
)

$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:RUNNER_TEMP 'OmniKes-Lifecycle-Test'
$programDataRoot = Join-Path $env:ProgramData 'OmniKes'
$databaseDir = Join-Path $programDataRoot 'postgresql-data'
$portFile = Join-Path $programDataRoot 'postgresql-port.txt'
$passwordFile = Join-Path $programDataRoot '.omnikes-pg-password'
$logFile = Join-Path $env:RUNNER_TEMP 'omnikes-installer-lifecycle.log'

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Install-OmniKes {
  Write-Host "Installing/upgrading OmniKes into $installDir"
  $arguments = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=$installDir")
  $process = Start-Process -FilePath $SetupExe -ArgumentList $arguments -Wait -PassThru
  Assert ($process.ExitCode -eq 0) "OmniKes installer failed with exit code $($process.ExitCode)."
  Assert (Test-Path (Join-Path $installDir 'installer\omnikes.exe')) 'omnikes.exe was not installed.'
  Assert (Test-Path (Join-Path $databaseDir 'PG_VERSION')) 'PostgreSQL cluster was not initialized in ProgramData.'
  Assert (Test-Path $portFile) 'PostgreSQL port file is missing.'
  Assert (Test-Path $passwordFile) 'PostgreSQL password file is missing.'
}

function Stop-OmniKesServer {
  $nodePath = Join-Path $installDir 'runtime\node\node.exe'
  $serverPath = Join-Path $installDir 'app\server.js'
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ExecutablePath -and
      [System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $nodePath -and
      $_.CommandLine -and $_.CommandLine.Contains($serverPath)
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

function Invoke-Psql([string]$Sql) {
  $port = (Get-Content -LiteralPath $portFile -Raw).Trim()
  $password = (Get-Content -LiteralPath $passwordFile -Raw).Trim()
  $psql = Join-Path $installDir 'runtime\postgresql\bin\psql.exe'
  $env:PGPASSWORD = $password
  try {
    $output = & $psql -h 127.0.0.1 -p $port -U omnikes -d omnikes -v ON_ERROR_STOP=1 -Atqc $Sql 2>&1
    Assert ($LASTEXITCODE -eq 0) "PostgreSQL probe failed: $output"
    return ($output | Out-String).Trim()
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
}

try {
  Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
  Install-OmniKes

  # Launch the local server without opening a browser or requiring an interactive desktop.
  $launcher = Join-Path $installDir 'installer\OmniKesLauncher.cmd'
  $quotedLauncher = '"' + $launcher + '"'
  Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', $quotedLauncher) -WindowStyle Hidden
  $healthReady = $false
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    try {
      $health = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 2
      if ($health.StatusCode -eq 200) { $healthReady = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
  }
  if (-not $healthReady) {
    Write-Host '=== OmniKes launcher diagnostics ==='
    $launcherLogDir = Join-Path $env:LOCALAPPDATA 'OmniKes\logs'
    if (Test-Path $launcherLogDir) {
      Get-ChildItem $launcherLogDir -Filter 'launcher-*.log' -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 2 |
        ForEach-Object {
          Write-Host "--- $($_.FullName) ---"
          Get-Content -LiteralPath $_.FullName -Tail 160
        }
    } else {
      Write-Host "Launcher log directory not found: $launcherLogDir"
    }

    $runtimeLog = Join-Path $programDataRoot 'logs\runtime-install.log'
    if (Test-Path $runtimeLog) {
      Write-Host "--- $runtimeLog ---"
      Get-Content -LiteralPath $runtimeLog -Tail 160
    }

    Write-Host '--- PostgreSQL service ---'
    sc.exe queryex OmniKesPostgreSQL 2>&1
    Write-Host '--- PostgreSQL port configuration ---'
    if (Test-Path $portFile) {
      $diagnosticPort = (Get-Content -LiteralPath $portFile -Raw).Trim()
      Write-Host "Configured port: $diagnosticPort"
      & (Join-Path $installDir 'runtime\postgresql\bin\pg_isready.exe') -h 127.0.0.1 -p $diagnosticPort -t 3 2>&1
    } else {
      Write-Host 'PostgreSQL port file is missing.'
    }

    Write-Host '--- Relevant processes ---'
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^(node|postgres|omnikes)\.exe

  # Reproduce the first-install user journey: create the admin, then create the first store.
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $registration = @{
    organizationName = 'OmniKes Windows Installer QA'
    name = 'Installer QA Admin'
    email = 'installer-qa@omnikes.local'
    password = 'OmniKes-QA-Password-2026!'
    confirmPassword = 'OmniKes-QA-Password-2026!'
  } | ConvertTo-Json
  $registerRaw = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/auth/register' -Method Post -ContentType 'application/json' -Body $registration -WebSession $session
  $registerResponse = $registerRaw.Content | ConvertFrom-Json
  Assert ($registerResponse.user.organizationId) 'First administrator registration did not return an organization.'
  # The production cookie is Secure; pass its token explicitly because the CI smoke test uses local HTTP.
  $cookieHeader = [string]$registerRaw.Headers['Set-Cookie']
  $tokenMatch = [regex]::Match($cookieHeader, 'auth_token=([^;]+)')
  Assert ($tokenMatch.Success) 'Registration did not issue an auth_token cookie.'
  $authHeaders = @{ Cookie = "auth_token=$($tokenMatch.Groups[1].Value)" }

  $storePayload = @{
    name = 'Magasin QA'
    code = 'QA-FIRST-STORE'
    address = ''
    city = ''
    country = ''
    phone = ''
    # email intentionally omitted: it is optional.
  } | ConvertTo-Json
  $storeResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/stores' -Method Post -ContentType 'application/json' -Body $storePayload -Headers $authHeaders
  Assert ($storeResponse.store.id) 'First store API did not return a persisted store.'
  Assert ($storeResponse.store.code -eq 'QA-FIRST-STORE') 'First store response contains an unexpected store code.'
  Write-Host 'FIRST ADMIN + FIRST STORE API E2E: PASS'

  # Put a durable marker in the local database, then reinstall over the same directory.
  [void](Invoke-Psql "CREATE TABLE IF NOT EXISTS installer_upgrade_probe (probe_key text PRIMARY KEY, probe_value text NOT NULL); INSERT INTO installer_upgrade_probe VALUES ('preservation', 'must-survive-upgrade') ON CONFLICT (probe_key) DO UPDATE SET probe_value = EXCLUDED.probe_value;")
  Stop-OmniKesServer
  Install-OmniKes
  $probe = Invoke-Psql "SELECT probe_value FROM installer_upgrade_probe WHERE probe_key = 'preservation';"
  Assert ($probe -eq 'must-survive-upgrade') 'In-place upgrade did not preserve the PostgreSQL database.'
  Write-Host 'IN-PLACE UPGRADE + DATABASE PRESERVATION: PASS'

  # Uninstall must remove Program Files while intentionally preserving ProgramData data.
  Stop-OmniKesServer
  $uninstaller = Join-Path $installDir 'unins000.exe'
  Assert (Test-Path $uninstaller) 'Inno Setup uninstaller is missing.'
  $uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -Wait -PassThru
  Assert ($uninstallProcess.ExitCode -eq 0) "OmniKes uninstaller failed with exit code $($uninstallProcess.ExitCode)."
  Start-Sleep -Seconds 2
  Assert (-not (Test-Path $installDir)) "Program Files installation directory remains after uninstall: $installDir"
  Assert (Test-Path (Join-Path $databaseDir 'PG_VERSION')) 'Uninstall unexpectedly removed PostgreSQL user data.'
  Assert (Test-Path $passwordFile) 'Uninstall unexpectedly removed the PostgreSQL credential.'
  $service = Get-Service -Name 'OmniKesPostgreSQL' -ErrorAction SilentlyContinue
  Assert (-not $service) 'PostgreSQL Windows service registration remains after uninstall.'
  Write-Host 'UNINSTALL PROGRAM FILES + PRESERVE PROGRAMDATA: PASS'
  Write-Host 'WINDOWS INSTALLER LIFECYCLE: PASS'
} catch {
  $_ | Out-String | Add-Content -LiteralPath $logFile
  throw
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
 } |
      Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine |
      Format-List

    Write-Host '--- Port 3000 listeners ---'
    netstat.exe -ano -p tcp | Select-String ':3000'
    Write-Host '=== End OmniKes launcher diagnostics ==='
  }
  Assert $healthReady 'Packaged OmniKes server did not become healthy.'

  # Reproduce the first-install user journey: create the admin, then create the first store.
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $registration = @{
    organizationName = 'OmniKes Windows Installer QA'
    name = 'Installer QA Admin'
    email = 'installer-qa@omnikes.local'
    password = 'OmniKes-QA-Password-2026!'
    confirmPassword = 'OmniKes-QA-Password-2026!'
  } | ConvertTo-Json
  $registerRaw = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/auth/register' -Method Post -ContentType 'application/json' -Body $registration -WebSession $session
  $registerResponse = $registerRaw.Content | ConvertFrom-Json
  Assert ($registerResponse.user.organizationId) 'First administrator registration did not return an organization.'
  # The production cookie is Secure; pass its token explicitly because the CI smoke test uses local HTTP.
  $cookieHeader = [string]$registerRaw.Headers['Set-Cookie']
  $tokenMatch = [regex]::Match($cookieHeader, 'auth_token=([^;]+)')
  Assert ($tokenMatch.Success) 'Registration did not issue an auth_token cookie.'
  $authHeaders = @{ Cookie = "auth_token=$($tokenMatch.Groups[1].Value)" }

  $storePayload = @{
    name = 'Magasin QA'
    code = 'QA-FIRST-STORE'
    address = ''
    city = ''
    country = ''
    phone = ''
    # email intentionally omitted: it is optional.
  } | ConvertTo-Json
  $storeResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/stores' -Method Post -ContentType 'application/json' -Body $storePayload -Headers $authHeaders
  Assert ($storeResponse.store.id) 'First store API did not return a persisted store.'
  Assert ($storeResponse.store.code -eq 'QA-FIRST-STORE') 'First store response contains an unexpected store code.'
  Write-Host 'FIRST ADMIN + FIRST STORE API E2E: PASS'

  # Put a durable marker in the local database, then reinstall over the same directory.
  [void](Invoke-Psql "CREATE TABLE IF NOT EXISTS installer_upgrade_probe (probe_key text PRIMARY KEY, probe_value text NOT NULL); INSERT INTO installer_upgrade_probe VALUES ('preservation', 'must-survive-upgrade') ON CONFLICT (probe_key) DO UPDATE SET probe_value = EXCLUDED.probe_value;")
  Stop-OmniKesServer
  Install-OmniKes
  $probe = Invoke-Psql "SELECT probe_value FROM installer_upgrade_probe WHERE probe_key = 'preservation';"
  Assert ($probe -eq 'must-survive-upgrade') 'In-place upgrade did not preserve the PostgreSQL database.'
  Write-Host 'IN-PLACE UPGRADE + DATABASE PRESERVATION: PASS'

  # Uninstall must remove Program Files while intentionally preserving ProgramData data.
  Stop-OmniKesServer
  $uninstaller = Join-Path $installDir 'unins000.exe'
  Assert (Test-Path $uninstaller) 'Inno Setup uninstaller is missing.'
  $uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -Wait -PassThru
  Assert ($uninstallProcess.ExitCode -eq 0) "OmniKes uninstaller failed with exit code $($uninstallProcess.ExitCode)."
  Start-Sleep -Seconds 2
  Assert (-not (Test-Path $installDir)) "Program Files installation directory remains after uninstall: $installDir"
  Assert (Test-Path (Join-Path $databaseDir 'PG_VERSION')) 'Uninstall unexpectedly removed PostgreSQL user data.'
  Assert (Test-Path $passwordFile) 'Uninstall unexpectedly removed the PostgreSQL credential.'
  $service = Get-Service -Name 'OmniKesPostgreSQL' -ErrorAction SilentlyContinue
  Assert (-not $service) 'PostgreSQL Windows service registration remains after uninstall.'
  Write-Host 'UNINSTALL PROGRAM FILES + PRESERVE PROGRAMDATA: PASS'
  Write-Host 'WINDOWS INSTALLER LIFECYCLE: PASS'
} catch {
  $_ | Out-String | Add-Content -LiteralPath $logFile
  throw
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
