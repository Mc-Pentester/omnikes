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

# The release tag is the single source of truth for every distributed version.
$appVersion = $env:APP_VERSION
if (-not $appVersion -and $env:RELEASE_TAG) {
  $appVersion = $env:RELEASE_TAG -replace '^[vV]', ''
}
if (-not $appVersion) {
  $packageMetadata = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
  $appVersion = [string]$packageMetadata.version
}
if ($appVersion -cnotmatch '^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$') {
  throw "Invalid application version '$appVersion'. Set APP_VERSION or RELEASE_TAG to a valid version."
}
$env:APP_VERSION = $appVersion
$env:NEXT_PUBLIC_APP_VERSION = $appVersion

# Keep npm metadata, the compiled Next.js application, and Inno Setup aligned.
npm.cmd version $appVersion --no-git-tag-version --allow-same-version
if ($LASTEXITCODE -ne 0) { throw "Could not synchronize package.json and package-lock.json to version $appVersion." }
Write-Host "Packaging OmniKes application version: $appVersion"

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

# Materialize the approved OmniKes brand icon for the native launcher and Inno Setup.
$iconBytes = [Convert]::FromBase64String("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")
$launcherIcon = Join-Path $installer "omnikes.ico"
[System.IO.File]::WriteAllBytes($launcherIcon, $iconBytes)
if ((Get-Item $launcherIcon).Length -lt 1000) { throw "OmniKes Windows icon asset is invalid or incomplete." }

Copy-Item (Join-Path $standalone "*") $app -Recurse -Force
if (Test-Path ".next\static") { Copy-Item ".next\static" (Join-Path $app ".next") -Recurse -Force }
if (Test-Path "public") { Copy-Item "public" (Join-Path $app "public") -Recurse -Force }
if (Test-Path "prisma") { Copy-Item "prisma" (Join-Path $app "prisma") -Recurse -Force }
Copy-Item "package.json" (Join-Path $app "package.json") -Force
Copy-Item "package-lock.json" (Join-Path $app "package-lock.json") -Force
Copy-Item "prisma.config.ts" (Join-Path $app "prisma.config.ts") -Force

$stagedPackage = Get-Content (Join-Path $app "package.json") -Raw | ConvertFrom-Json
$stagedLock = Get-Content (Join-Path $app "package-lock.json") -Raw | ConvertFrom-Json
if ($stagedPackage.version -ne $appVersion -or $stagedLock.version -ne $appVersion -or $stagedLock.packages."".version -ne $appVersion) {
  throw "Staged application npm metadata does not match release version $appVersion."
}


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
  "check_admin_permissions.ts"
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

$nodeVersion = "22.22.2"
$nodeRoot = Join-Path $root "vendor\node\runtime\node-v$nodeVersion-win-x64"
if (-not (Test-Path (Join-Path $nodeRoot "node.exe"))) { throw "Prepared Node.js $nodeVersion runtime not found at $nodeRoot." }
$packagedNodeVersion = (& (Join-Path $nodeRoot "node.exe") --version).Trim()
if ($LASTEXITCODE -ne 0 -or $packagedNodeVersion -ne "v$nodeVersion") { throw "Prepared Node.js runtime version mismatch: expected v$nodeVersion, got $packagedNodeVersion." }
Copy-Item (Join-Path $nodeRoot "*") $node -Recurse -Force

$pgRoot = Join-Path $root "vendor\postgresql\runtime\pgsql"
if (-not (Test-Path (Join-Path $pgRoot "bin\postgres.exe"))) { throw "Prepared PostgreSQL runtime not found." }
Copy-Item (Join-Path $pgRoot "*") $postgres -Recurse -Force

Copy-Item "installer\OmniKesLauncher.cmd" $installer -Force
Copy-Item "installer\ensure-postgres-service.ps1" $installer -Force
Copy-Item "installer\install-runtime.cmd" $installer -Force
Copy-Item "installer\install-runtime.cjs" $installer -Force
Copy-Item "installer\initialize-rbac.cjs" $installer -Force
Copy-Item "config\rbac-catalog.json" (Join-Path $installer "rbac-catalog.json") -Force
Copy-Item "installer\prepare-user-env.cjs" $installer -Force

# Bundle the WebView2 WinForms SDK and Evergreen Standalone Runtime for offline PCs.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$webView2Version = "1.0.2903.40"
$webView2Package = Join-Path $env:TEMP "Microsoft.Web.WebView2.$webView2Version.zip"
$webView2Extract = Join-Path $env:TEMP "OmniKes-WebView2-$webView2Version"
Invoke-WebRequest -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$webView2Version" -OutFile $webView2Package -UseBasicParsing
if (Test-Path $webView2Extract) { Remove-Item $webView2Extract -Recurse -Force }
Expand-Archive -LiteralPath $webView2Package -DestinationPath $webView2Extract -Force
$webView2Lib = Join-Path $webView2Extract "lib\net462"
$webView2WinForms = Join-Path $webView2Lib "Microsoft.Web.WebView2.WinForms.dll"
$webView2Core = Join-Path $webView2Lib "Microsoft.Web.WebView2.Core.dll"
$webView2Loader = Join-Path $webView2Extract "runtimes\win-x64\native\WebView2Loader.dll"
foreach ($required in @($webView2WinForms, $webView2Core, $webView2Loader)) {
  if (-not (Test-Path $required)) { throw "WebView2 SDK file missing: $required" }
}
Copy-Item $webView2WinForms,$webView2Core,$webView2Loader $installer -Force

$webView2Runtime = Join-Path $installer "MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124701" -OutFile $webView2Runtime -UseBasicParsing
if (-not (Test-Path $webView2Runtime) -or (Get-Item $webView2Runtime).Length -lt 50000000) {
  throw "The offline Evergreen WebView2 Runtime installer download is missing or unexpectedly small."
}
Write-Host "Bundled WebView2 SDK $webView2Version and Evergreen x64 runtime."

# Build a native, windowed Windows launcher. The .NET Framework compiler is present
# on Windows build agents and on supported Windows installations.
$cscCandidates = @(
  (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
  (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
) | Where-Object { Test-Path $_ }
$csc = $cscCandidates | Select-Object -First 1
if (-not $csc) { throw "C# compiler (csc.exe) was not found on the Windows build agent." }
$launcherSource = Join-Path $root "installer\OmniKesLauncher.cs"
$launcherExe = Join-Path $installer "omnikes.exe"
& $csc /nologo /target:winexe /optimize+ "/win32icon:$launcherIcon" /out:$launcherExe /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:"$webView2WinForms" /reference:"$webView2Core" $launcherSource
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $launcherExe)) {
  throw "Native omnikes.exe launcher compilation failed."
}
Write-Host "Native Windows launcher built: $launcherExe"

& $iscc "installer\OmniKes.iss"
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed." }

$expectedInstaller = Join-Path $root "dist\installer\OmniKes-Setup-$appVersion-x64.exe"
if (-not (Test-Path $expectedInstaller)) {
  throw "Versioned installer was not produced. Expected: $expectedInstaller"
}
Write-Host "Verified application, npm metadata, and Windows installer version: $appVersion"
Write-Host "OmniKes Windows offline Setup: PASS"
