$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

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

$dist = Join-Path $root "dist\windows"
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist -Force | Out-Null

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql://build:build@127.0.0.1:5432/omnikes_build"
}

npm run prepare:embedded-postgres
npm run prepare:node-runtime
npm run build

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
if (Test-Path ".next\static") { Copy-Item ".next\static" (Join-Path $app ".next") -Recurse -Force }
if (Test-Path "public") { Copy-Item "public" (Join-Path $app "public") -Recurse -Force }
if (Test-Path "prisma\migrations") { Copy-Item "prisma\migrations" (Join-Path $app "prisma") -Recurse -Force }
Copy-Item "package.json" (Join-Path $app "package.json") -Force
Copy-Item "package-lock.json" (Join-Path $app "package-lock.json") -Force

# Prisma CLI and migration engines are required at client install time.
npm ci --omit=dev --prefix $app

$nodeRoot = Join-Path $root "vendor\node\runtime\node-v22.20.0-win-x64"
if (-not (Test-Path (Join-Path $nodeRoot "node.exe"))) { throw "Prepared Node.js runtime not found." }
Copy-Item (Join-Path $nodeRoot "*") $node -Recurse -Force

$pgRoot = Join-Path $root "vendor\postgresql\runtime\pgsql"
if (-not (Test-Path (Join-Path $pgRoot "bin\postgres.exe"))) { throw "Prepared PostgreSQL runtime not found." }
Copy-Item (Join-Path $pgRoot "*") $postgres -Recurse -Force

Copy-Item "installer\OmniKesLauncher.cmd" $installer -Force
Copy-Item "installer\install-runtime.cmd" $installer -Force
Copy-Item "installer\install-runtime.cjs" $installer -Force

& $iscc "installer\OmniKes.iss"
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed." }

Write-Host "OmniKes Windows offline Setup: PASS"
