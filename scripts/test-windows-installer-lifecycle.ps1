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
  Assert (Test-Path $appPortFile) 'OmniKes application port file is missing.'
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
  $appPortText = (Get-Content -LiteralPath $appPortFile -Raw).Trim()
  $appPort = 0
  Assert ([int]::TryParse($appPortText, [ref]$appPort) -and $appPort -ge 3001 -and $appPort -le 3099) "OmniKes application port is invalid: $appPortText"
  $baseUrl = "http://127.0.0.1:$appPort"

  # Launch the local server without opening a browser or requiring an interactive desktop.
  $launcher = Join-Path $installDir 'installer\OmniKesLauncher.cmd'
  $quotedLauncher = '"' + $launcher + '"'
  Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', $quotedLauncher) -WindowStyle Hidden
  $healthReady = $false
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    try {
      $health = Invoke-WebRequest -Uri ($baseUrl + '/api/health') -UseBasicParsing -TimeoutSec 2
      $healthBody = $health.Content | ConvertFrom-Json
      if ($health.StatusCode -eq 200 -and $healthBody.application -eq 'OmniKes') { $healthReady = $true; break }
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

    Write-Host "--- Application port $appPort listeners ---"
    netstat.exe -ano -p tcp | Select-String (':' + $appPort)
    Write-Host '=== End OmniKes launcher diagnostics ==='
  }

  Assert $healthReady 'Packaged OmniKes server did not become healthy.'

  # Reproduce the first-install user journey: create the admin, then create the first store.
  # Use one HttpClient for registration, session verification and store creation.
  # Cookies are disabled in the handler so the exact auth_token from Set-Cookie
  # is explicitly attached to every authenticated request below.
  Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.UseCookies = $false
  $httpClient = [System.Net.Http.HttpClient]::new($handler)
  $httpClient.Timeout = [TimeSpan]::FromSeconds(30)
  function Invoke-OmniKesJsonRequest {
    param(
      [Parameter(Mandatory = $true)][string]$Method,
      [Parameter(Mandatory = $true)][string]$Path,
      [string]$JsonBody,
      [string]$CookieHeader
    )

    $request = [System.Net.Http.HttpRequestMessage]::new(
      [System.Net.Http.HttpMethod]::new($Method),
      ($baseUrl + $Path)
    )
    try {
      [void]$request.Headers.TryAddWithoutValidation('Origin', $baseUrl)
      if (-not [string]::IsNullOrWhiteSpace($CookieHeader)) {
        [void]$request.Headers.TryAddWithoutValidation('Cookie', $CookieHeader)
      }
      if ($null -ne $JsonBody) {
        $request.Content = [System.Net.Http.StringContent]::new(
          $JsonBody,
          [System.Text.Encoding]::UTF8,
          'application/json'
        )
      }

      $response = $httpClient.SendAsync($request).GetAwaiter().GetResult()
      try {
        $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        return [pscustomobject]@{
          StatusCode = [int]$response.StatusCode
          IsSuccessStatusCode = [bool]$response.IsSuccessStatusCode
          Body = $responseBody
          Response = $response
        }
      } catch {
        $response.Dispose()
        throw
      }
    } finally {
      $request.Dispose()
    }
  }

  try {
    $registration = @{
      organizationName = 'OmniKes Windows Installer QA'
      name = 'Installer QA Admin'
      email = 'installer-qa@omnikes.local'
      password = 'OmniKes-QA-Password-2026!'
      confirmPassword = 'OmniKes-QA-Password-2026!'
    } | ConvertTo-Json

    $registerResult = Invoke-OmniKesJsonRequest -Method 'POST' -Path '/api/auth/register' -JsonBody $registration
    Write-Host "Registration HTTP status: $($registerResult.StatusCode)"
    if (-not $registerResult.IsSuccessStatusCode) {
      throw "First administrator registration failed with HTTP $($registerResult.StatusCode): $($registerResult.Body)"
    }

    $registerResponse = $registerResult.Body | ConvertFrom-Json
    $organizationId = [string]$registerResponse.user.organizationId
    $registeredUserId = [string]$registerResponse.user.id
    Assert (-not [string]::IsNullOrWhiteSpace($organizationId)) 'First administrator registration did not return an organization.'
    Assert (-not [string]::IsNullOrWhiteSpace($registeredUserId)) 'First administrator registration did not return a user.'

    $setCookieValues = $null
    if (-not $registerResult.Response.Headers.TryGetValues('Set-Cookie', [ref]$setCookieValues)) {
      throw "Registration HTTP $($registerResult.StatusCode) did not return Set-Cookie. Body: $($registerResult.Body)"
    }
    $setCookieHeader = $setCookieValues -join '; '
    $tokenMatch = [regex]::Match($setCookieHeader, 'auth_token=([^;,]+)')
    Assert ($tokenMatch.Success) "Registration Set-Cookie did not contain auth_token. Set-Cookie: $setCookieHeader"
    $authCookie = "auth_token=$($tokenMatch.Groups[1].Value)"
    $registerResult.Response.Dispose()

    # Verify that the issued cookie resolves to the same user and organization
    # before attempting store creation or proceeding to the upgrade phase.
    $sessionResult = Invoke-OmniKesJsonRequest -Method 'GET' -Path '/api/auth/me' -CookieHeader $authCookie
    Write-Host "Session verification HTTP status: $($sessionResult.StatusCode)"
    if (-not $sessionResult.IsSuccessStatusCode) {
      throw "Session verification failed with HTTP $($sessionResult.StatusCode): $($sessionResult.Body)"
    }
    $sessionResponse = $sessionResult.Body | ConvertFrom-Json
    Assert ([string]$sessionResponse.user.id -eq $registeredUserId) "Session user does not match registered administrator. Response: $($sessionResult.Body)"
    Assert ([string]$sessionResponse.user.organizationId -eq $organizationId) "Session organization does not match registration. Response: $($sessionResult.Body)"
    $sessionResult.Response.Dispose()
    Write-Host 'REGISTRATION SESSION VALIDATION: PASS'

    $storePayload = @{
      name = 'Magasin QA'
      code = 'QA-FIRST-STORE'
      address = ''
      city = ''
      country = ''
      phone = ''
      # email intentionally omitted: it is optional.
    } | ConvertTo-Json
    $storeResult = Invoke-OmniKesJsonRequest -Method 'POST' -Path '/api/stores' -JsonBody $storePayload -CookieHeader $authCookie
    Write-Host "First store creation HTTP status: $($storeResult.StatusCode)"
    if ($storeResult.StatusCode -ne 201) {
      throw "First store creation failed with HTTP $($storeResult.StatusCode): $($storeResult.Body)"
    }
    $storeResponse = $storeResult.Body | ConvertFrom-Json
    Assert ($storeResponse.store.id) "First store API did not return a persisted store. Response: $($storeResult.Body)"
    Assert ($storeResponse.store.code -eq 'QA-FIRST-STORE') "First store response contains an unexpected store code. Response: $($storeResult.Body)"
    $storeResult.Response.Dispose()

    # Verify that first registration provisioned every standard tenant role.
    $rolesResult = Invoke-OmniKesJsonRequest -Method 'GET' -Path '/api/admin/roles' -CookieHeader $authCookie
    if ($rolesResult.StatusCode -ne 200) {
      throw "Standard role catalog retrieval failed with HTTP $($rolesResult.StatusCode): $($rolesResult.Body)"
    }
    $rolesResponse = $rolesResult.Body | ConvertFrom-Json
    $roleNames = @($rolesResponse.roles | ForEach-Object { [string]$_.name })
    $expectedRoles = @('ADMIN','MANAGER','SUPERVISOR','CASHIER','SALES_ASSOCIATE','INVENTORY_MANAGER','WAREHOUSE_CLERK','PURCHASING_MANAGER','ACCOUNTANT','SALES_MANAGER','CUSTOMER_SERVICE')
    foreach ($expectedRole in $expectedRoles) {
      Assert ($roleNames -contains $expectedRole) "First organization registration did not provision standard role $expectedRole. Returned roles: $($roleNames -join ', ')"
    }
    $rolesResult.Response.Dispose()
    Write-Host 'FIRST ORGANIZATION STANDARD RBAC ROLES: PASS'

    # Recheck the same authenticated session before any upgrade operation.
    $preUpgradeSession = Invoke-OmniKesJsonRequest -Method 'GET' -Path '/api/auth/me' -CookieHeader $authCookie
    Write-Host "Pre-upgrade session verification HTTP status: $($preUpgradeSession.StatusCode)"
    if (-not $preUpgradeSession.IsSuccessStatusCode) {
      throw "Session was not valid before upgrade: HTTP $($preUpgradeSession.StatusCode): $($preUpgradeSession.Body)"
    }
    $preUpgradeResponse = $preUpgradeSession.Body | ConvertFrom-Json
    Assert ([string]$preUpgradeResponse.user.id -eq $registeredUserId) "Pre-upgrade session resolved to a different user. Response: $($preUpgradeSession.Body)"
    $preUpgradeSession.Response.Dispose()
    Write-Host 'FIRST ADMIN + SESSION + FIRST STORE API E2E: PASS'
  } finally {
    $httpClient.Dispose()
    $handler.Dispose()
  }

  # Put a durable marker in the local database, then reinstall over the same directory.
  [void](Invoke-Psql "CREATE TABLE IF NOT EXISTS installer_upgrade_probe (probe_key text PRIMARY KEY, probe_value text NOT NULL); INSERT INTO installer_upgrade_probe VALUES ('preservation', 'must-survive-upgrade') ON CONFLICT (probe_key) DO UPDATE SET probe_value = EXCLUDED.probe_value;")
  Stop-OmniKesServer
  Install-OmniKes
  $probe = Invoke-Psql "SELECT probe_value FROM installer_upgrade_probe WHERE probe_key = 'preservation';"
  Assert ($probe -eq 'must-survive-upgrade') 'In-place upgrade did not preserve the PostgreSQL database.'
  Write-Host 'IN-PLACE UPGRADE + DATABASE PRESERVATION: PASS'

  # Uninstall must remove Program Files while intentionally preserving ProgramData data.
  Stop-OmniKesServer
  $cleanupScriptCopy = Join-Path $env:RUNNER_TEMP 'OmniKes-uninstall-runtime.ps1'
  Copy-Item -LiteralPath (Join-Path $installDir 'installer\uninstall-runtime.ps1') -Destination $cleanupScriptCopy -Force
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

  # Exercise the explicit data-deletion branch after proving the default keep-data path.
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $cleanupScriptCopy -InstallRoot $installDir -DeleteData
  Assert ($LASTEXITCODE -eq 0) 'Explicit OmniKes ProgramData deletion failed.'
  Assert (-not (Test-Path $programDataRoot)) 'Explicit data deletion left OmniKes ProgramData behind.'
  Write-Host 'EXPLICIT PROGRAMDATA DELETION: PASS'
  Remove-Item -LiteralPath $cleanupScriptCopy -Force -ErrorAction SilentlyContinue
  Write-Host 'WINDOWS INSTALLER LIFECYCLE: PASS'
} catch {
  $_ | Out-String | Add-Content -LiteralPath $logFile
  throw
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
