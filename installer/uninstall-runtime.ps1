param(
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot
)

$ErrorActionPreference = 'Stop'
$script:CleanupFailed = $false
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$logDirectory = Join-Path $env:ProgramData 'OmniKes\logs'
$logFile = Join-Path $logDirectory 'uninstall-runtime.log'

function Write-Log([string]$Message) {
  try {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] $Message"
  } catch {
    # Cleanup logging must not prevent uninstall.
  }
}

Write-Log "Uninstall cleanup started for $InstallRoot"

# Stop only the OmniKes launcher and the Node process running this installation.
try {
  $launcherPath = Join-Path $InstallRoot 'installer\omnikes.exe'
  Get-CimInstance Win32_Process -Filter "Name = 'omnikes.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and [System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $launcherPath } |
    ForEach-Object {
      Write-Log "Stopping OmniKes launcher PID $($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
} catch {
  Write-Log "Launcher stop warning: $($_.Exception.Message)"
  $script:CleanupFailed = $true
}

try {
  $nodePath = Join-Path $InstallRoot 'runtime\node\node.exe'
  $serverPath = Join-Path $InstallRoot 'app\server.js'
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ExecutablePath -and
      [System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $nodePath -and
      $_.CommandLine -and $_.CommandLine.Contains($serverPath)
    } |
    ForEach-Object {
      Write-Log "Stopping OmniKes server PID $($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
} catch {
  Write-Log "Application process stop warning: $($_.Exception.Message)"
  $script:CleanupFailed = $true
}

# The database files and credentials live in ProgramData and are deliberately retained.
try {
  $service = Get-Service -Name 'OmniKesPostgreSQL' -ErrorAction SilentlyContinue
  if ($service) {
    if ($service.Status -ne 'Stopped') {
      Write-Log 'Stopping PostgreSQL Windows service OmniKesPostgreSQL'
      Stop-Service -Name 'OmniKesPostgreSQL' -Force -ErrorAction Stop
      $service.WaitForStatus(
        [System.ServiceProcess.ServiceControllerStatus]::Stopped,
        [TimeSpan]::FromSeconds(45)
      )
    }
    $service.Close()

    Write-Log 'Deleting PostgreSQL Windows service registration'
    & "$env:SystemRoot\System32\sc.exe" delete OmniKesPostgreSQL | Out-Null
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1060) {
      throw "sc.exe delete failed with exit code $LASTEXITCODE"
    }

    $deadline = (Get-Date).AddSeconds(30)
    do {
      Start-Sleep -Milliseconds 500
      $remaining = Get-Service -Name 'OmniKesPostgreSQL' -ErrorAction SilentlyContinue
      if ($remaining) { $remaining.Close() }
    } while ($remaining -and (Get-Date) -lt $deadline)

    if ($remaining) {
      Write-Log 'PostgreSQL service registration is still present after the deletion wait.'
      $script:CleanupFailed = $true
    } else {
      Write-Log 'PostgreSQL service registration removed.'
    }
  } else {
    Write-Log 'PostgreSQL service was already absent.'
  }
} catch {
  Write-Log "PostgreSQL service cleanup warning: $($_.Exception.Message)"
  $script:CleanupFailed = $true
}

Write-Log 'Uninstall cleanup finished. ProgramData database and credentials were not removed.'
if ($script:CleanupFailed) {
  Write-Log 'Cleanup could not safely stop all OmniKes processes/services; cancelling uninstall to avoid deleting files in use.'
  exit 1
}
