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

# Materialize the approved OmniKes brand icon for the native launcher and Inno Setup.
$iconBytes = [Convert]::FromBase64String("AAABAAUAEBAAAAAAIADkBAAAVgAAACAgAAAAACAADgYAADoFAAAwMAAAAAAgAHAHAABICwAAQEAAAAAAIABuCQAAuBIAAICAAAAAACAALRMAACYcAACJUE5HDQoaCgAAAA1JSERSAAAAEAAAABAIAwAAACgtD1MAAAMAUExURfmcFABY7vN2CxJg4gCa9E5mpNnm6wBN4HWGqZaw5fJvBf+gAAYnngAw0QAu8xtKnFif5eprCQYkdQwodRw6gheu+Edhm/zHE/zRowAe0wBM9q3p//JsBAAFOAEhfwAnjAAl9BldXTBftgCs5QCZ6GpVVVFsy/ywZvvFZP///wA/PwAIOgDl/1UAAF1hfVhrnEBXjlWqqr9/P4CFnrTI6/8AAO6ZBP//AAAAAAAabPr7/AAmjQE1sgETVgA6ygBE1AFW8wAKTgAAfQBJ7AArqQUjdgAA/QC3/AGn/AGH/AFn+gABVACX/AF3+83Y7Ku405Sn0AHF/Obp8QABOQB//wA4+NHk9gAArQBVqvyWAQAZbAE0lgBV/vynAfyHAQAXbwANYys5bPt5AQA/vwAZcgD//1pkiwAp+QAdigAah3aGr8PM6P22AQAZbQATVgAWazdEdUtZiAACOwHV/o+XtAAUVAASVQAZbQApyAlEsSxHjJTJ+JnX+gATVgAjlgA4zYSLprjD2wAZagA+/wCq/1VVqpa18bDJ7gASVAAcixglWgAkkAB4+Gp0mHDH+gANSAAjjgA9fAACzwAm9AEztQA3ywVW1DhSiy6p+WNrjmt6p2q29rPZ+sjK1wEUWAAqrAB/f4ebyQAlkAAnpzBaqE5WeQASVQAdiwAb7wYocwAn7QBH6QBl7C9Kh0FMdH9/f22V7/3DAgAOUgANSAANRgAa5wBE1ABb7wB28wCG+z8/f22p+aSsxgAAlgAdhQAb5QAc6gAd8AIhiwAjiwEstRsydyp2+DOZ952juv+VAP24KQEORwAVOQAttgIopwAm7wAp7AAq7AM1tAE1uAA3xAA4ywA48whj2ABp6wCk+TVUkjhktjKI91BqrVKX9XGM0qGmu/V4BOyFA/ymRf+1UAAHOgAHOwAOSgAYmQAXsAAW1AAZ6wAqqgYoywQxsAA36wA28gBG8gBp7wB/vwB98wB49wCF9QCa7yEsWU1jml11q0SK8kuk/E3J+WF5zwAAAFopTAwAAAEAdFJOU////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wBT9wclAAAAk0lEQVR4nGP4jwYYsAq88PL0CNyJELCbAmb6wgRc/v/3t7ICskMhAi7W/zs7rawC4Ga4/re1cvC1Krb//z8dLGD539bejtPH4y9MheV/a0uraF+PWMf//y3jQWZY2mTY29jY27n8j0wB22LpYG9raW0r+n8yE9Qd1tKWd7OtYsAOAAtYgkAa0LByuF+2BBPwHDIAADQFwb6bOEBeAAAAAElFTkSuQmCCiVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAADAFBMVEX5nBQAWO7zdgsSYOIAmvROZqTZ5usATeB1hqmWsOXybwX/oAAGJ54AMNEALvMbSpxYn+XqawkGJHUMKHUcOoIXrvhHYZv8xxP80aMAHtMATPat6f/ybAQABTgBIX8AJ4wAJfQZXV0wX7YArOUAmehqVVVRbMv8sGb7xWT///8APz8ACDoA5f9VAABdYX1Ya5xAV45Vqqq/fz+AhZ60yOv/AADumQT//wAAAAAAGmz6+/wAJo0BNbIBE1YAOsoARNQBVvMACk4AAH0ASewAK6kFI3YAAP0At/wBp/wBh/wBZ/oAAVQAl/wBd/vN2OyruNOUp9ABxfzm6fEAATkAf/8AOPjR5PYAAK0AVar8lgEAGWwBNJYAVf78pwH8hwEAF28ADWMrOWz7eQEAP78AGXIA//9aZIsAKfkAHYoAGod2hq/DzOj9tgEAGW0AE1YAFms3RHVLWYgAAjsB1f6Pl7QAFFQAElUAGW0AKcgJRLEsR4yUyfiZ1/oAE1YAI5YAOM2Ei6a4w9sAGWoAPv8Aqv9VVaqWtfGwye4AElQAHIsYJVoAJJAAePhqdJhwx/oADUgAI44APXwAAs8AJvQBM7UAN8sFVtQ4Uosuqflja45reqdqtvaz2frIytcBFFgAKqwAf3+Hm8kAJZAAJ6cwWqhOVnkAElUAHYsAG+8GKHMAJ+0AR+kAZewvSodBTHR/f39tle/9wwIADlIADUgADUYAGucARNQAW+8AdvMAhvs/P39tqfmkrMYAAJYAHYUAG+UAHOoAHfACIYsAI4sBLLUbMncqdvgzmfedo7r/lQD9uCkBDkcAFTkALbYCKKcAJu8AKewAKuwDNbQBNbgAN8QAOMsAOPMIY9gAaesApPk1VJI4ZLYyiPdQaq1Sl/VxjNKhprv1eATshQP8pkX/tVAABzoABzsADkoAGJkAF7AAFtQAGesAKqoGKMsEMbAAN+sANvIARvIAae8Af78AffMAePcAhfUAmu8hLFlNY5pddatEivJLpPxNyflhec8AAABaKUwMAAABAHRSTlP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AU/cHJQAADtxJREFUeJztmnlsFNcZwG1uaAgkhJDmVhQ1kVq1lVpVnTezczA78e7g3bUXeSvbhbWR5RN8YTDYYOz8gblBBAwYG8R9owDhiCAECCSEiCQkpCQkAUKbs0pzKHfSTL93zOysd2a9do4qkj/J1s7szvt+813ve28mzfg/S1ofQB9AH0AfQB9AH0AfwC8PYPmL6bsO79796pEjRxYt+jz99od+ToAPdx3+NBDw+zMzfT5fBhXfawM++8fPAfDE8MH9dT+TzEzCABDZ2dlTp2a89vjtPzHA8MGyHqBiA2BGoAyfb//JAN67eEjWsdgBfDYAApHte7wXrkgBoOwVVQaxCOL0ZxMxQXwDeozQLcANr0iybAfwBwK6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")
$launcherIcon = Join-Path $installer "omnikes.ico"
[System.IO.File]::WriteAllBytes($launcherIcon, $iconBytes)
if ((Get-Item $launcherIcon).Length -lt 10000) { throw "Transparent OmniKes Windows icon is invalid or incomplete." }
if ((Get-Item $launcherIcon).Length -lt 10000) { throw "Transparent OmniKes Windows icon is invalid or incomplete." }
if ((Get-Item $launcherIcon).Length -lt 1000) { throw "OmniKes Windows icon asset is invalid or incomplete." }

Copy-Item (Join-Path $standalone "*") $app -Recurse -Force
if (Test-Path ".next\static") { Copy-Item ".next\static" (Join-Path $app ".next") -Recurse -Force }
if (Test-Path "public") { Copy-Item "public" (Join-Path $app "public") -Recurse -Force }
if (Test-Path "prisma") { Copy-Item "prisma" (Join-Path $app "prisma") -Recurse -Force }
Copy-Item "package.json" (Join-Path $app "package.json") -Force
Copy-Item "package-lock.json" (Join-Path $app "package-lock.json") -Force
Copy-Item "prisma.config.ts" (Join-Path $app "prisma.config.ts") -Force


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

Write-Host "OmniKes Windows offline Setup: PASS"
