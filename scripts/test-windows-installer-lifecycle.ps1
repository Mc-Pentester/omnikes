param(
  [Parameter(Mandatory = $true)]
  [string]$SetupExe
)

$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:RUNNER_TEMP 'OmniKes-Lifecycle-Test'
$programDataRoot = Join-Path $env:ProgramData 'OmniKes'
$databaseDir = Join-Path $programDataRoot 'postgresql-data'
$portFile = Join-Path $programDataRoot 'postgresql-port.txt'
$appPortFile = Join-Path $programDataRoot 'app-port.txt'
$script:baseUrl = $null
$passwordFile = Join-Path $programDataRoot '.omnikes-pg-password'
$logFile = Join-Path $env:RUNNER_TEMP 'omnikes-installer-lifecycle.log'

function Assert([object]$Condition, [string]$Message) {
  # Accept native booleans as well as values such as IDs without letting
  # PowerShell's parameter binder fail before the assertion can report context.
  if ($null -eq $Condition -or -not [bool]$Condition) { throw $Message }
}

function Install-OmniKes {
  Write-Host "Installing/upgrading OmniKes into $installDir"
  $arguments = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=$installDir")
  $process = Start-Process -FilePath $SetupExe -ArgumentList $arguments -Wait -PassThru
  Assert ($process.ExitCode -eq 0) "OmniKes installer failed with exit code $($process.ExitCode)."
  Assert (Test-Path (Join-Path $installDir 'installer\omnikes.exe')) 'omnikes.exe was not installed.'
  Assert (Test-Path (Join-Path $databaseDir 'PG_VERSION')) 'PostgreSQL cluster was not initialized in ProgramData.'
  Assert (Test-Path $portFile) 'PostgreSQL port file is missing.'
  Assert (Test-Path $appPortFile) 'Application port file is missing.'
  Assert (Test-Path $passwordFile) 'PostgreSQL password file is missing.'
  $appPort = (Get-Content -LiteralPath $appPortFile -Raw).Trim()
  Assert ($appPort -match '^\d{4,5}$' -and [int]$appPort -ge 3001 -and [int]$appPort -le 3099) "Persisted application port is invalid: $appPort"
  $script:baseUrl = "http://127.0.0.1:$appPort"
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
      $health = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing -TimeoutSec 2
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
      Where-Object { $_.Name -match '^(node|postgres|omnikes)\.exe$' } |
      Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine |
      Format-List

    Write-Host '--- Application port listeners ---'
    if (Test-Path $appPortFile) {
      $diagnosticAppPort = (Get-Content -LiteralPath $appPortFile -Raw).Trim()
      Write-Host "Configured application port: $diagnosticAppPort"
      netstat.exe -ano -p tcp | Select-String ":$diagnosticAppPort"
    }
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
  # Use .NET HttpClient for this POST instead of Windows PowerShell 5.1
  # Invoke-WebRequest, which can throw an internal NullReferenceException on
  # otherwise valid responses when handling cookies on hosted Windows runners.
  Add-Type -AssemblyName System.Net.Http
  $httpClient = New-Object System.Net.Http.HttpClient
  try {
    $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, "$baseUrl/api/auth/register")
    $request.Headers.TryAddWithoutValidation('Origin', $baseUrl) | Out-Null
    $request.Content = New-Object System.Net.Http.StringContent($registration, [System.Text.Encoding]::UTF8, 'application/json')
    $registerHttpResponse = $httpClient.SendAsync($request).GetAwaiter().GetResult()
    $registerContent = $registerHttpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    Assert ([int]$registerHttpResponse.StatusCode -eq 200 -or [int]$registerHttpResponse.StatusCode -eq 201) "First administrator registration returned HTTP $([int]$registerHttpResponse.StatusCode): $registerContent"
    $registerResponse = $registerContent | ConvertFrom-Json
    Assert (-not [string]::IsNullOrWhiteSpace([string]$registerResponse.user.organizationId)) 'First administrator registration did not return an organization.'
    # The production cookie is Secure; pass its token explicitly because the CI smoke test uses local HTTP.
    $cookieHeader = ''
    if ($registerHttpResponse.Headers.Contains('Set-Cookie')) {
      $cookieHeader = [string]::Join('; ', $registerHttpResponse.Headers.GetValues('Set-Cookie'))
    }
    $tokenMatch = [regex]::Match($cookieHeader, 'auth_token=([^;]+)')
    Assert ($tokenMatch.Success) "Registration did not issue an auth_token cookie. Response headers: $($registerHttpResponse.Headers)"
  } finally {
    if ($request) { $request.Dispose() }
    $httpClient.Dispose()
  }
  # Use the bearer-token path supported by getSessionToken. This avoids
  # Windows PowerShell 5.1's inconsistent handling of manually supplied Cookie
  # headers while still exercising the production session validation.
  $authToken = $tokenMatch.Groups[1].Value
  $apiClient = New-Object System.Net.Http.HttpClient
  $apiClient.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $authToken)
  $apiClient.DefaultRequestHeaders.TryAddWithoutValidation('Origin', $baseUrl) | Out-Null

  $roleHttpResponse = $apiClient.GetAsync("$baseUrl/api/admin/roles").GetAwaiter().GetResult()
  $roleContent = $roleHttpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  Assert ([int]$roleHttpResponse.StatusCode -eq 200) "Admin roles API returned HTTP $([int]$roleHttpResponse.StatusCode): $roleContent"
  $roleResponse = $roleContent | ConvertFrom-Json
  $expectedRoleNames = @('ADMIN', 'MANAGER', 'SUPERVISOR', 'CASHIER', 'SALES_ASSOCIATE', 'INVENTORY_MANAGER', 'WAREHOUSE_CLERK', 'PURCHASING_MANAGER', 'ACCOUNTANT', 'SALES_MANAGER', 'CUSTOMER_SERVICE', 'STORE_MANAGER', 'SELLER', 'AUDITOR')
  $actualRoleNames = @($roleResponse.roles | ForEach-Object { $_.name })
  foreach ($roleName in $expectedRoleNames) { Assert ($actualRoleNames -contains $roleName) "Standard role '$roleName' is missing after first registration." }
  Assert ($actualRoleNames.Count -ge $expectedRoleNames.Count) "Expected at least $($expectedRoleNames.Count) standard roles, found $($actualRoleNames.Count)."
  Write-Host 'FIRST ORGANIZATION STANDARD RBAC ROLES: PASS'

  $storePayload = @{
    name = 'Magasin QA'
    code = 'QA-FIRST-STORE'
    address = ''
    city = ''
    country = ''
    phone = ''
    # email intentionally omitted: it is optional.
  } | ConvertTo-Json
  $storeRequest = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, "$baseUrl/api/stores")
  $storeRequest.Content = New-Object System.Net.Http.StringContent($storePayload, [System.Text.Encoding]::UTF8, 'application/json')
  try {
    $storeHttpResponse = $apiClient.SendAsync($storeRequest).GetAwaiter().GetResult()
    $storeContent = $storeHttpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    Assert ([int]$storeHttpResponse.StatusCode -eq 200 -or [int]$storeHttpResponse.StatusCode -eq 201) "First store API returned HTTP $([int]$storeHttpResponse.StatusCode): $storeContent"
    $storeResponse = $storeContent | ConvertFrom-Json
  } finally {
    $storeRequest.Dispose()
    $apiClient.Dispose()
  }
  Assert ($null -ne $storeResponse.store) "First store API response did not contain a store object: $storeContent"
  $storeId = [string]$storeResponse.store.id
  $organizationId = [string]$registerResponse.user.organizationId
  Assert (-not [string]::IsNullOrWhiteSpace($storeId)) 'First store API did not return a persisted store ID.'
  Assert ($storeResponse.store.code -eq 'QA-FIRST-STORE') 'First store response contains an unexpected store code.'
  # Confirm the API result is durable in PostgreSQL and belongs to the new organization.
  $escapedStoreId = $storeId.Replace("'", "''")
  $escapedOrganizationId = $organizationId.Replace("'", "''")
  $storePersistedSql = 'SELECT COUNT(*) FROM stores WHERE id = ''' + $escapedStoreId + ''' AND code = ''QA-FIRST-STORE'' AND "organizationId" = ''' + $escapedOrganizationId + ''';'
  $storePersisted = Invoke-Psql $storePersistedSql
  Assert ([int]$storePersisted -eq 1) 'First store API returned a store that was not persisted for the newly created organization.'
  Write-Host 'FIRST ADMIN + FIRST STORE API + DATABASE PERSISTENCE: PASS'

  # Put a durable marker in the local database, then reinstall over the same directory.
  [void](Invoke-Psql "CREATE TABLE IF NOT EXISTS installer_upgrade_probe (probe_key text PRIMARY KEY, probe_value text NOT NULL); INSERT INTO installer_upgrade_probe VALUES ('preservation', 'must-survive-upgrade') ON CONFLICT (probe_key) DO UPDATE SET probe_value = EXCLUDED.probe_value;")
  Stop-OmniKesServer
  Install-OmniKes
  $probe = Invoke-Psql "SELECT probe_value FROM installer_upgrade_probe WHERE probe_key = 'preservation';"
  Assert ($probe -eq 'must-survive-upgrade') 'In-place upgrade did not preserve the PostgreSQL database.'
  $storeAfterUpgrade = Invoke-Psql $storePersistedSql
  Assert ([int]$storeAfterUpgrade -eq 1) 'In-place upgrade did not preserve the first organization and store.'
  # Verify the upgraded package can start the application, not just preserve its database.
  $launcher = Join-Path $installDir 'installer\\OmniKesLauncher.cmd'
  $quotedLauncher = '"' + $launcher + '"'
  Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', $quotedLauncher) -WindowStyle Hidden
  $upgradeHealthReady = $false
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    try {
      $upgradeHealth = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing -TimeoutSec 2
      if ($upgradeHealth.StatusCode -eq 200) { $upgradeHealthReady = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
  }
  Assert $upgradeHealthReady 'OmniKes did not become healthy after the in-place upgrade.'
  Write-Host 'IN-PLACE UPGRADE + DATABASE AND APPLICATION HEALTH: PASS'

  # Keep a separate Node process running to simulate Clarodaro. The OmniKes
  # uninstaller must leave applications outside its own installation directory
  # untouched, even when they also use Node.js.
  $clarodaroRoot = Join-Path $env:RUNNER_TEMP 'Clarodaro-Uninstall-Isolation'
  New-Item -ItemType Directory -Path $clarodaroRoot -Force | Out-Null
  $clarodaroServer = Join-Path $clarodaroRoot 'server.js'
  Set-Content -LiteralPath $clarodaroServer -Value 'setInterval(() => {}, 1000);' -Encoding UTF8
  $externalNode = (Get-Command node.exe -ErrorAction Stop).Source
  $clarodaroProcess = Start-Process -FilePath $externalNode -ArgumentList @("`"$clarodaroServer`"") -PassThru
  Start-Sleep -Seconds 2
  $clarodaroProcess.Refresh()
  Assert (-not $clarodaroProcess.HasExited) 'Clarodaro isolation process did not start.'

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
  $clarodaroProcess.Refresh()
  Assert (-not $clarodaroProcess.HasExited) 'OmniKes uninstaller terminated an unrelated Clarodaro-like Node process.'
  Write-Host 'UNINSTALL WITH CLARODARO-LIKE PROCESS RUNNING: PASS'
  Write-Host 'CLARODARO PROCESS ISOLATION: PASS'
  Write-Host 'UNINSTALL PROGRAM FILES + PRESERVE PROGRAMDATA: PASS'

  # Reinstall using the retained data, then explicitly request a full data purge.
  Install-OmniKes
  $purgeUninstaller = Join-Path $installDir 'unins000.exe'
  $purgeProcess = Start-Process -FilePath $purgeUninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/PURGEDATA=yes') -Wait -PassThru
  Assert ($purgeProcess.ExitCode -eq 0) "OmniKes full-data uninstaller failed with exit code $($purgeProcess.ExitCode)."
  Assert (-not (Test-Path $installDir)) "Program Files installation directory remains after full-data uninstall: $installDir"
  Assert (-not (Test-Path $programDataRoot)) "OmniKes ProgramData remains after explicit full-data uninstall: $programDataRoot"
  $clarodaroProcess.Refresh()
  Assert (-not $clarodaroProcess.HasExited) 'Full-data OmniKes uninstall terminated an unrelated Clarodaro-like Node process.'
  Write-Host 'EXPLICIT FULL DATA PURGE: PASS'
  Write-Host 'WINDOWS INSTALLER LIFECYCLE: PASS'
} catch {
  $_ | Out-String | Add-Content -LiteralPath $logFile
  throw
} finally {
  if ($clarodaroProcess -and -not $clarodaroProcess.HasExited) {
    Stop-Process -Id $clarodaroProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}