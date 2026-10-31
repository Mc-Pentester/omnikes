$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$iscc = $env:ISCC
if (-not $iscc) {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 7\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 7\ISCC.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ChocolateyInstall "lib\innosetup\tools\ISCC.exe")
  ) | Where-Object { $_ -and (Test-Path $_) }
  $command = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
  if ($command) { $iscc = $command.Source }
  else { $iscc = $candidates | Select-Object -First 1 }
}
if (-not $iscc -or -not (Test-Path $iscc)) {
  throw "ISCC.exe not found. Set ISCC or install Inno Setup 7/6."
}

$dist = Join-Path $root "dist\windows"
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist -Force | Out-Null

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql://build:build@127.0.0.1:5432/omnikes_build"
}

npm.cmd run prepare:embedded-postgres
npm.cmd run prepare:node-runtime
npm.cmd exec prisma generate
npm.cmd run build
npm.cmd exec prisma generate

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
if (Test-Path "prisma") { Copy-Item "prisma" (Join-Path $app "prisma") -Recurse -Force }
Copy-Item "package.json" (Join-Path $app "package.json") -Force
Copy-Item "package-lock.json" (Join-Path $app "package-lock.json") -Force


# Remove repository-only documentation and audit artifacts copied by Next standalone tracing.
$documentationDirectories = @("docs", "audit", "reports", "report", "rapports", "rapport")
foreach ($directory in $documentationDirectories) {
  $path = Join-Path $app $directory
  if (Test-Path $path) {
    Remove-Item $path -Recurse -Force
    Write-Host "Excluded repository documentation directory: $directory"
  }
}

# Markdown files at the application root are development/repository documentation, not runtime assets.
Get-ChildItem $app -File -Filter "*.md" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "Excluded repository documentation file: $($_.Name)"
  Remove-Item $_.FullName -Force
}

# Remove known repository-only helper/config files if Next standalone tracing copied them.
$repositoryOnlyFiles = @(
  "docker-compose.yml",
  "eslint.config.mjs",
  "omnikes.code-workspace",
  "playwright.config.ts",
  "vitest.config.ts",
  "vitest.integration.config.ts",
  "tsconfig.json",
  "tsconfig.bootstrap.json",
  "check_admin_permissions.ts",
  "check_data_counts.ts",
  "check_permissions_forensic.ts",
  "check_store_delete_permission.ts",
  "reactivate_store_a.ts",
  "test_api.ts",
  "verify-rbac.ts",
  "verify_store_state.ts"
)
foreach ($file in $repositoryOnlyFiles) {
  $path = Join-Path $app $file
  if (Test-Path $path) {
    Remove-Item $path -Force
    Write-Host "Excluded repository-only file: $file"
  }
}

# Verify only repository-level documentation was excluded. Do not scan nested runtime
# routes or vendor dependencies by basename: /reports and /administration/audit are
# application features, and PostgreSQL/pgAdmin may ship their own documentation.
foreach ($directory in $documentationDirectories) {
  if (Test-Path (Join-Path $app $directory)) {
    throw "Repository documentation directory remains in package: $directory"
  }
}

$repositoryReportFiles = Get-ChildItem $app -File -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match '(?i)(audit|report|rapport|diagnostic|forensic|remediation|analysis|analyse)' -and
    $_.Extension -match '(?i)^\.(md|txt|log|csv|pdf)$'
  }
if ($repositoryReportFiles) {
  $names = ($repositoryReportFiles | ForEach-Object { $_.FullName }) -join ", "
  throw "Repository audit/report files remain at the application root: $names"
}

# Install only production dependencies into the final staged app, then generate Prisma
# Client inside that exact directory. A client generated in the source repository is
# not guaranteed to be included in Next's standalone trace or in the staged installer.
npm.cmd ci --omit=dev --prefix $app
if ($LASTEXITCODE -ne 0) { throw "Production dependency installation failed." }

Push-Location $app
try {
  npm.cmd exec -- prisma generate --schema prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) { throw "Prisma Client generation failed in the staged application." }
}
finally {
  Pop-Location
}

$generatedPrismaClient = Join-Path $app "node_modules\.prisma\client"
$generatedPrismaDefault = Join-Path $generatedPrismaClient "default.js"
if (-not (Test-Path $generatedPrismaDefault)) {
  throw "Generated Prisma Client is missing from the staged app: $generatedPrismaDefault"
}

# Next may trace Prisma's generated runtime under .next/node_modules. Mirror the
# generated client there as well so both Node module-resolution paths are satisfied.
$nextNodeModules = Join-Path $app ".next\node_modules"
if (Test-Path $nextNodeModules) {
  $nextGeneratedClient = Join-Path $nextNodeModules ".prisma\client"
  New-Item -ItemType Directory -Path $nextGeneratedClient -Force | Out-Null
  Copy-Item (Join-Path $generatedPrismaClient "*") $nextGeneratedClient -Recurse -Force
  if (-not (Test-Path (Join-Path $nextGeneratedClient "default.js"))) {
    throw "Generated Prisma Client was not copied into .next/node_modules."
  }
}
Write-Host "Generated Prisma Client verified in staged Windows application."

$nodeRoot = Join-Path $root "vendor\node\runtime\node-v22.20.0-win-x64"
if (-not (Test-Path (Join-Path $nodeRoot "node.exe"))) { throw "Prepared Node.js runtime not found." }
Copy-Item (Join-Path $nodeRoot "*") $node -Recurse -Force

$pgRoot = Join-Path $root "vendor\postgresql\runtime\pgsql"
if (-not (Test-Path (Join-Path $pgRoot "bin\postgres.exe"))) { throw "Prepared PostgreSQL runtime not found." }
Copy-Item (Join-Path $pgRoot "*") $postgres -Recurse -Force

Copy-Item "installer\OmniKesLauncher.cmd" $installer -Force
Copy-Item "installer\install-runtime.cmd" $installer -Force
Copy-Item "installer\install-runtime.cjs" $installer -Force
Copy-Item "installer\initialize-rbac.cjs" $installer -Force
Copy-Item "installer\prepare-user-env.cjs" $installer -Force

# Build a native, windowless Windows launcher. The .NET Framework compiler is present
# on Windows build agents and on supported Windows installations.
$cscCandidates = @(
  (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
  (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
) | Where-Object { Test-Path $_ }
$csc = $cscCandidates | Select-Object -First 1
if (-not $csc) { throw "C# compiler (csc.exe) was not found on the Windows build agent." }
$launcherSource = Join-Path $root "installer\OmniKesLauncher.cs"
$launcherExe = Join-Path $installer "omnikes.exe"
& $csc /nologo /target:winexe /optimize+ /out:$launcherExe /reference:System.dll /reference:System.Windows.Forms.dll $launcherSource
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $launcherExe)) {
  throw "Native omnikes.exe launcher compilation failed."
}
Write-Host "Native Windows launcher built: $launcherExe"

& $iscc "installer\OmniKes.iss"
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed." }

Write-Host "OmniKes Windows offline Setup: PASS"
