param(
  [Parameter(Mandatory = $true)][string]$LogFile,
  [int]$TimeoutSeconds = 60
)
$ErrorActionPreference = 'Stop'
$serviceName = 'OmniKesPostgreSQL'
function Write-Log([string]$Message) {
  try { Add-Content -LiteralPath $LogFile -Value "[$(Get-Date -Format o)] $Message" -ErrorAction Stop } catch { }
}
try {
  Write-Log "Checking PostgreSQL Windows service '$serviceName'."
  $service = Get-Service -Name $serviceName -ErrorAction Stop
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ($true) {
    $service.Refresh()
    switch ([string]$service.Status) {
      'Running' { Write-Log 'PostgreSQL service is running.'; exit 0 }
      'Stopped' {
        Write-Log 'PostgreSQL is stopped; requesting service startup.'
        try { Start-Service -Name $serviceName -ErrorAction Stop }
        catch {
          $service.Refresh()
          if ($service.Status -notin @('StartPending', 'Running')) { throw }
        }
      }
      'StartPending' { Write-Log 'PostgreSQL is already starting; waiting without a duplicate start request.' }
      'StopPending' { Write-Log 'PostgreSQL is stopping; waiting before attempting restart.' }
      default { throw "PostgreSQL service entered unsupported state '$($service.Status)'." }
    }
    if ((Get-Date) -ge $deadline) {
      $service.Refresh()
      throw "PostgreSQL did not reach Running within $TimeoutSeconds seconds (last state: $($service.Status))."
    }
    Start-Sleep -Seconds 1
  }
} catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  if ($_.Exception.Message -match 'Cannot find any service with service name|does not exist') {
    Write-Log 'Service registration is missing. Run the OmniKes installer as administrator to repair PostgreSQL; existing database files are preserved.'
  }
  exit 1
}
