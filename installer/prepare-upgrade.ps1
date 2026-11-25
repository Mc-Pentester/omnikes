param(
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot
)

$ErrorActionPreference = 'Stop'
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$logDirectory = Join-Path $env:ProgramData 'OmniKes\logs'
$logFile = Join-Path $logDirectory 'prepare-upgrade.log'

function Write-Log([string]$Message) {
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] $Message"
}

function Stop-ProcessesFromInstall([string]$Name, [scriptblock]$Filter, [string]$Description) {
  $processes = @(Get-CimInstance Win32_Process -Filter "Name = '$Name'" -ErrorAction Stop | Where-Object $Filter)
  foreach ($process in $processes) {
    Write-Log "Stopping $Description PID $($process.ProcessId)"
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
  }
  $deadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 300
    $remaining = @(Get-CimInstance Win32_Process -Filter "Name = '$Name'" -ErrorAction Stop | Where-Object $Filter)
  } while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)
  if ($remaining.Count -gt 0) {
    throw "$Description process remains active; refusing to replace locked runtime files."
  }
}

try {
  Write-Log "Preparing safe in-place upgrade for $InstallRoot"

  $launcherPath = Join-Path $InstallRoot 'installer\omnikes.exe'
  Stop-ProcessesFromInstall 'omnikes.exe' {
    $_.ExecutablePath -and [System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $launcherPath
  } 'OmniKes launcher'

  $nodePath = Join-Path $InstallRoot 'runtime\node\node.exe'
  $serverPath = Join-Path $InstallRoot 'app\server.js'
  Stop-ProcessesFromInstall 'node.exe' {
    $_.ExecutablePath -and
    [System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $nodePath -and
    $_.CommandLine -and $_.CommandLine.Contains($serverPath)
  } 'OmniKes Node server'

  $service = Get-Service -Name 'OmniKesPostgreSQL' -ErrorAction SilentlyContinue
  if ($service) {
    if ($service.Status -ne 'Stopped') {
      Write-Log 'Stopping OmniKesPostgreSQL before replacing embedded PostgreSQL runtime files.'
      Stop-Service -Name 'OmniKesPostgreSQL' -Force -ErrorAction Stop
      $service = Get-Service -Name 'OmniKesPostgreSQL' -ErrorAction Stop
      $service.WaitForStatus(
        [System.ServiceProcess.ServiceControllerStatus]::Stopped,
        [TimeSpan]::FromSeconds(60)
      )
    }
    $service.Close()
  }

  $postgresPath = Join-Path $InstallRoot 'runtime\postgresql\bin\postgres.exe'
  $remainingPostgres = @(Get-CimInstance Win32_Process -Filter "Name = 'postgres.exe'" -ErrorAction Stop |
    Where-Object { $_.ExecutablePath -and [System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $postgresPath })
  if ($remainingPostgres.Count -gt 0) {
    throw 'Embedded PostgreSQL processes are still active after service stop; refusing to replace locked DLLs.'
  }

  Write-Log 'Safe upgrade preparation passed. PostgreSQL data and ProgramData credentials were not modified.'
  exit 0
} catch {
  Write-Log "SAFE UPGRADE PREPARATION FAILED: $($_.Exception.Message)"
  Write-Error $_
  exit 1
}
