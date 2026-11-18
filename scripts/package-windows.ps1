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
$iconBytes = [Convert]::FromBase64String("dany9Om6v//amr/qgA/XJkA/wAA9f9VAKp2hrh/m8aCkrwAAAAAGmv6+/wAJo4BE1UANLIAVvQAOsoASe0ARNQAK6cACkoCIngBp/wBZ/kBl/sAt/wAd/sAh/wAAH4AAP6ruNQAxfyVp88AOPTm6vIAAVPQ1+oAAKz8lwH9iAEENZL8dwH9pwEAJ/UAAD79tgHY4/QAAzkAHYQB1f2VyPYAElYAGG+4wtm1xuoAVf4uSImz1/gBF3AACkwDE1IAKsyOlrMAF3NLWYkAGXEAGHEsOGkAGHYBFVPEx9UAIpBudpcAPbxVZJICFFYAGXAAf/86RXQAElUBElM5VZN1hK0BE1SesNMAHIkZJFaHm8X+xAIAGYhvt/gAGYgAHIotmPYvp/ZTVamRuPXDzOQAG4gAPHkAPfkAVaoA//8vhvlja5B9kbwEKdgADUg9PXz/fwAAN+sGU9JSqPmYquaY0/gADUcAIYpSmPdtpvUAG/EAJJEAKawAR+kvePUADUgAGooAHYgAHOoAf7+Eiqelq8UAGs8AJ+oAOesJQ6sA5P6y5v36xpQADUUADEQAHK4AGNUAKvAAavIAONNMZ6dpeqikp7rSVxMAIqYAJ9QAJ+4AeeciLFoptPZETHRIZ60AGekAN+guS4tKifd/f3/uaAMBI5MAK+sAKe0AR+4AWNnR093T9f7mcQT2qDkADWYoMVw5VZMjVNdOVXhbc6l0w/vyiQEAAdIAGegAJa0AavgvZupTt/mtu+fydQP+1gEAIJYAJs4cMXEARfMAV+4Aluw3VJIAAABTvknRAAABAHRSTlP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AU/cHJQAADTBJREFUeJztmmtsHNUVx40h5NHwJvQDH1qJo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AD1/1UAqnaGuH+bxoKSvAAAAAAaa/r7/AAmjgETVQA0sgBW9AA6ygBJ7QBE1AArpwAKSgIieAGn/AFn+QGX+wC3/AB3+wCH/AAAfgAA/qu41ADF/JWnzwA49Obq8gABU9DX6gAArPyXAf2IAQQ1kvx3Af2nAQAn9QAAPv22Adjj9AADOQAdhAHV/ZXI9gASVgAYb7jC2bXG6gBV/i5IibPX+AEXcAAKTAMTUgAqzI6WswAXc0tZiQAZcQAYcSw4aQAYdgEVU8TH1QAikG52lwA9vFVkkgIUVgAZcAB//zpFdAASVQESUzlVk3WErQETVJ6w0wAciRkkVoebxf7EAgAZiG+3+AAZiAAcii2Y9i+n9lNVqZG49cPM5AAbiAA8eQA9+QBVqgD//y+G+WNrkH2RvAQp2AANSD09fP9/AAA36wZT0lKo+Ziq5pjT+AANRwAhilKY922m9QAb8QAkkQAprABH6S949QANSAAaigAdiAAc6gB/v4SKp6WrxQAazwAn6gA56wlDqwDk/rLm/frGlAANRQAMRAAcrgAY1QAq8ABq8gA400xnp2l6qKSnutJXEwAipgAn1AAn7gB55yIsWim09kRMdEhnrQAZ6QA36C5Li0qJ939/f+5oAwEjkwAr6wAp7QBH7gBY2dHT3dP1/uZxBPaoOQANZigxXDlVkyNU105VeFtzqXTD+/KJAQAB0gAZ6AAlrQBq+C9m6lO3+a275/J1A/7WAQAglgAmzhwxcQBF8wBX7gCW7DdUkgAAAFO+SdEAAAEAdFJOU////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wBT9wclAAAlmElEQVR4nO2dC3BU533oQbYxVjCuHYLH4+kkk+ROM5NM2unc3untzJ07ve3Z8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")
$launcherIcon = Join-Path $installer "omnikes.ico"
[System.IO.File]::WriteAllBytes($launcherIcon, $iconBytes)
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
