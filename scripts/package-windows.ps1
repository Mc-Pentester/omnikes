$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Next.js build replaces .next; never package over an active dev server.
$rootPattern = [regex]::Escape($root)
$nextProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -match $rootPattern -and $_.CommandLine -match '(?i)(next[\\/].*\bdev\b|next\s+dev)' }
if ($nextProcesses) {
  throw "A Next.js development server is running for this project. Stop it before packaging; no build or runtime preparation was started."
}

$iscc = $env:ISCC
if (-not $iscc) {
  $candidates = @(
    "$env:ProgramFiles(x86)\Inno Setup 7\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 7\ISCC.exe",
    "$env:ProgramFiles(x86)\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
  )
  $iscc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $iscc) { throw "ISCC.exe not found. Set ISCC or install Inno Setup 7/6." }

$distRoot = Join-Path $root "dist"
$dist = Join-Path $distRoot "windows"
$installerOutput = Join-Path $distRoot "installer"

# Never erase a previous package automatically: preserve artifacts for recovery.
if (Test-Path $dist) {
  throw "Existing package output found at '$dist'. It was preserved. Archive or move it manually before rebuilding."
}
if (Test-Path $installerOutput) {
  throw "Existing installer output found at '$installerOutput'. It was preserved. Archive or move it manually before rebuilding."
}
New-Item -ItemType Directory -Path $dist,$installerOutput -Force | Out-Null

if (-not $env:DATABASE_URL) {
  $envFile = Join-Path $root ".env"
  if (Test-Path $envFile) {
    $databaseLine = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
    if ($databaseLine) {
      $env:DATABASE_URL = ($databaseLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
    }
  }
}
if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is required for the production build. Set it in the process environment or in the local .env file; no placeholder database URL will be used."
}

npm run prepare:embedded-postgres
if ($LASTEXITCODE -ne 0) { throw "Embedded PostgreSQL runtime preparation failed." }
npm run prepare:node-runtime
if ($LASTEXITCODE -ne 0) { throw "Node.js runtime preparation failed." }

# Runtime preparation must not be allowed to leave Prisma Client stale or absent.
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "Prisma Client generation failed." }

npm run build
if ($LASTEXITCODE -ne 0) { throw "Next.js production build failed." }

$standalone = Join-Path $root ".next\standalone"
if (-not (Test-Path (Join-Path $standalone "server.js"))) {
  throw ".next/standalone/server.js was not produced by the Next.js build."
}

$app = Join-Path $dist "app"
$node = Join-Path $dist "node"
$postgres = Join-Path $dist "postgresql"
$installer = Join-Path $dist "installer"
New-Item -ItemType Directory -Path $app,$node,$postgres,$installer -Force | Out-Null

Copy-Item (Join-Path $standalone "*") $app -Recurse -Force
# Remove environment files at every depth: machine-specific secrets must never ship.
Get-ChildItem -Path $app -Recurse -Force -File |
  Where-Object { $_.Name -match '^\.env($|\.)' } |
  Remove-Item -Force

if (Test-Path ".next\static") { Copy-Item ".next\static" (Join-Path $app ".next") -Recurse -Force }
if (Test-Path "public") { Copy-Item "public" (Join-Path $app "public") -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $app "prisma\migrations") -Force | Out-Null
if (Test-Path "prisma\migrations") { Copy-Item "prisma\migrations\*" (Join-Path $app "prisma\migrations") -Recurse -Force }
Copy-Item "prisma\schema.prisma" (Join-Path $app "prisma\schema.prisma") -Force
Copy-Item "prisma.config.ts" (Join-Path $app "prisma.config.ts") -Force
Copy-Item "package.json" (Join-Path $app "package.json") -Force
Copy-Item "package-lock.json" (Join-Path $app "package-lock.json") -Force

# Prisma CLI and migration engines are required for target-machine migrations.
npm ci --omit=dev --prefix $app
if ($LASTEXITCODE -ne 0) { throw "Production dependency installation inside the package failed." }

$nodeRoot = Join-Path $root "vendor\node\runtime\node-v22.20.0-win-x64"
if (-not (Test-Path (Join-Path $nodeRoot "node.exe"))) { throw "Prepared Node.js runtime not found." }
Copy-Item (Join-Path $nodeRoot "*") $node -Recurse -Force

$pgRoot = Join-Path $root "vendor\postgresql\runtime\pgsql"
if (-not (Test-Path (Join-Path $pgRoot "bin\postgres.exe"))) { throw "Prepared PostgreSQL runtime not found." }
Copy-Item (Join-Path $pgRoot "*") $postgres -Recurse -Force

Copy-Item "installer\OmniKesLauncher.cmd" $installer -Force
Copy-Item "installer\install-runtime.cmd" $installer -Force
Copy-Item "installer\install-runtime.cjs" $installer -Force
Copy-Item "installer\first-run-setup.cjs" $installer -Force
Copy-Item "installer\uninstall-runtime.cmd" $installer -Force
Copy-Item "installer\uninstall-runtime.cjs" $installer -Force

& $iscc "installer\OmniKes.iss"
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed." }

Write-Host "OmniKes Windows offline Setup: PASS"
