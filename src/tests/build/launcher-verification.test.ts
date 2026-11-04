/**
 * Verification test for Windows launcher configuration and PostgreSQL startup.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('Windows Launcher Verification', () => {
  const root = process.cwd();
  const installerPath = path.join(root, 'installer');
  const launcherPath = path.join(installerPath, 'OmniKesLauncher.cmd');
  const runtimeInstallerPath = path.join(installerPath, 'install-runtime.cjs');
  const issPath = path.join(installerPath, 'OmniKes.iss');

  it('should provide the native omnikes.exe launcher source', () => {
    const source = readFileSync(path.join(installerPath, 'OmniKesLauncher.cs'), 'utf8');
    expect(source).toContain('ProcessWindowStyle.Hidden');
    expect(source).toContain('http://127.0.0.1:3000/api/health');
    expect(source).toContain('MessageBox.Show');
    expect(source).toContain('using Microsoft.Web.WebView2.WinForms;');
    expect(source).toContain('new WebView2()');
    expect(source).toContain('CoreWebView2Environment.CreateAsync');
    expect(source).toContain('browser.CoreWebView2.Navigate("http://127.0.0.1:3000/")');
    expect(source).toContain('AreDevToolsEnabled = false');
    expect(source).toContain('WebView2');
    expect(source).toContain('Path.GetFullPath(Path.Combine(launcherDirectory, ".."))');
    expect(source).toContain('Path.GetFullPath(Path.Combine(launcherDirectory, "OmniKesLauncher.cmd"))');
    expect(source).not.toContain('Path.Combine(launcherDirectory, "installer"');
    const packaging = readFileSync(path.join(root, 'scripts', 'package-windows.ps1'), 'utf8');
    expect(packaging).toContain('target:winexe');
    expect(packaging).toContain('omnikes.exe');
    expect(packaging).toContain('Microsoft.Web.WebView2');
    expect(packaging).toContain('MicrosoftEdgeWebView2RuntimeInstallerX64.exe');
    expect(packaging).toContain('WebView2Loader.dll');
  });

  it('should have OmniKesLauncher.cmd as the hidden internal startup helper', () => {
    expect(existsSync(launcherPath)).toBe(true);
  });

  it('should configure OMNIKES_HOME correctly', () => {
    const helper = readFileSync(launcherPath, 'utf8');
    expect(helper).toContain('OMNIKES_HOME=%~dp0..');
    expect(helper).toContain('native WebView2 window');
    expect(helper).not.toContain('start "" "http://127.0.0.1:3000"');
  });

  it('should create user-writable directories and initialize logging first', () => {
    const content = readFileSync(launcherPath, 'utf8');
    expect(content).toContain('OMNIKES_DATA_DIR=%LOCALAPPDATA%');
    expect(content).toContain('OMNIKES_CACHE_DIR');
    expect(content.indexOf('set "LOG_FILE=')).toBeLessThan(content.indexOf('Preparing user-writable environment'));
  });

  it('should detect an existing application instance', () => {
    expect(readFileSync(launcherPath, 'utf8')).toContain(':3000');
  });

  it('should verify the packaged PostgreSQL readiness executable', () => {
    const content = readFileSync(launcherPath, 'utf8');
    expect(content).toContain('runtime\\postgresql\\bin\\pg_isready.exe');
    expect(content).toContain('sc.exe query OmniKesPostgreSQL');
    expect(content).toContain('sc.exe start OmniKesPostgreSQL');
    expect(content).toContain(':postgres_wait');
    expect(content).toContain('PG_PORT_FILE=%ProgramData%\\OmniKes\\postgresql-port.txt');
    expect(content).toContain('-p %PG_PORT%');
    expect(content).not.toContain('-p 5432');
  });

  it('should wait for application health', () => {
    expect(readFileSync(launcherPath, 'utf8')).toContain('/api/health');
  });

  it('should resolve the installer parent directory before invoking the runtime installer', () => {
    const content = readFileSync(path.join(installerPath, 'install-runtime.cmd'), 'utf8');
    expect(content).toContain('OMNIKES_HOME=%~dp0..');
    expect(content).toContain('%OMNIKES_HOME%\\runtime\\node\\node.exe');
    expect(content).toContain('%OMNIKES_HOME%\\installer\\install-runtime.cjs');
  });

  it('should register, start, and verify the PostgreSQL Windows service during installation', () => {
    const content = readFileSync(runtimeInstallerPath, 'utf8');
    expect(content).toContain("['register', '-D', data, '-N', serviceName, '-S', 'auto'");
    expect(content).toContain("['start', serviceName]");
    expect(content).toContain('waitForPostgres(password, port)');
    expect(content).toContain('serviceState()');
  });

  it('should avoid an existing PostgreSQL listener on port 5432 by selecting and persisting a dedicated port', () => {
    const runtime = readFileSync(runtimeInstallerPath, 'utf8');
    expect(runtime).toContain('programDataArg');
    expect(runtime).toContain('const minPort = 5433');
    expect(runtime).toContain('const maxPort = 5532');
    expect(runtime).toContain("execFileSync('netstat.exe'");
    expect(runtime).toContain('function choosePort()');
    expect(runtime).toContain("String(port) + '\\n'");
    expect(runtime).toContain('String(targetPort)');
    expect(runtime).not.toContain('const port = 5432');
    expect(runtime).toContain("'@127.0.0.1:' + port + '/' + dbName");
  });

  it('should require the PostgreSQL readiness binary during packaging', () => {
    const content = readFileSync(path.join(root, 'scripts', 'prepare-embedded-postgres.ts'), 'utf8');
    expect(content).toContain("'pg_isready.exe'");
  });

  it('should retain the first-launch environment preparation script', () => {
    expect(existsSync(path.join(installerPath, 'prepare-user-env.cjs'))).toBe(true);
  });

  it('should retain the Inno Setup launcher and runtime installation configuration', () => {
    const content = readFileSync(issPath, 'utf8');
    expect(content).toContain('installer\\omnikes.exe');
    expect(content).toContain('runtime\\node\\node.exe');
    expect(content).toContain('install-runtime.cjs');
    expect(content).not.toContain('install-runtime.cmd');
    expect(content).toContain('procedure CurStepChanged(CurStep: TSetupStep)');
    expect(content).toContain('if ResultCode <> 0 then');
    expect(content).toContain('--program-data-dir');
    expect(content).toContain('postgresql-port.txt');
    expect(content).toContain('MicrosoftEdgeWebView2RuntimeInstallerX64.exe');
    expect(content).toContain("'/silent /install'");
    expect(content).toContain('WebView2');
    expect(content).toContain('ewWaitUntilTerminated');
    expect(content).toContain('RaiseException');
    expect(content).toContain('omnikes.exe');
    expect(content).toContain('{autoprograms}');
    expect(content).toContain('PrivilegesRequired=admin');
  });
  
  it('should support in-place reinstall without replacing local configuration or PostgreSQL data', () => {
    const installer = readFileSync(issPath, 'utf8');
    const runtime = readFileSync(runtimeInstallerPath, 'utf8');
    expect(installer).toContain('AppId={{A2F77B5A-7D0E-4B15-9B8A-0A9B6E6A5C11}}');
    expect(installer).toContain('Excludes: ".env, .env.*"');
    expect(installer).toContain('{commonappdata}\\OmniKes\\postgresql-data');
    expect(installer).not.toContain('[UninstallDelete]');
    expect(runtime).toContain("const programDataArg = process.argv.indexOf('--program-data-dir')");
    expect(runtime).toContain("const omniKesDataDir = path.join(programDataDir, 'OmniKes')");
    expect(runtime).toContain("const data = path.join(omniKesDataDir, 'postgresql-data')");
    expect(runtime).toContain("const portFile = path.join(omniKesDataDir, 'postgresql-port.txt')");
    expect(runtime).toContain("const dbPasswordFile = path.join(omniKesDataDir, '.omnikes-pg-password')");
    expect(runtime).toContain("const legacyDbPasswordFile = path.join(data, '.omnikes-pg-password')");
    expect(runtime).toContain('fs.renameSync(legacyDbPasswordFile, dbPasswordFile)');
    expect(runtime).toContain('const remainingEntries = fs.readdirSync(data)');
    expect(runtime).toContain('Refusing to delete or overwrite these files.');
    expect(runtime).not.toContain("const dbPasswordFile = path.join(data, '.omnikes-pg-password')");
    expect(runtime).toContain("if (exists(path.join(data, 'PG_VERSION')))");
    expect(runtime).toContain("if (!exists(envPath))");
    expect(runtime).toContain("if (!state)");
    expect(runtime).toContain("run(process.execPath, [prismaCli, 'migrate', 'deploy'])");
  });

});