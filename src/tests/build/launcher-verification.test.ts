/**
 * Verification tests for the Windows launcher and installer scripts.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('Windows Launcher Verification', () => {
  const root = process.cwd();
  const installerPath = path.join(root, 'installer');
  const launcherPath = path.join(installerPath, 'OmniKesLauncher.cmd');
  const runtimeCmdPath = path.join(installerPath, 'install-runtime.cmd');
  const runtimeJsPath = path.join(installerPath, 'install-runtime.cjs');
  const issPath = path.join(installerPath, 'OmniKes.iss');
  const launcher = readFileSync(launcherPath, 'utf8');
  const runtimeCmd = readFileSync(runtimeCmdPath, 'utf8');
  const runtimeJs = readFileSync(runtimeJsPath, 'utf8');

  it('should have launcher and installer scripts', () => {
    expect(existsSync(launcherPath)).toBe(true);
    expect(existsSync(runtimeCmdPath)).toBe(true);
    expect(existsSync(runtimeJsPath)).toBe(true);
  });

  it('should resolve installation root from the script directory', () => {
    expect(launcher).toContain('for %%I in ("%~dp0..") do set "OMNIKES_HOME=%%~fI"');
    expect(runtimeCmd).toContain('for %%I in ("%~dp0..") do set "OMNIKES_HOME=%%~fI"');
    expect(runtimeCmd).not.toContain('OMNIKES_HOME=%~dp..');
  });

  it('should configure user-writable directories and define log before first use', () => {
    expect(launcher).toContain('OMNIKES_DATA_DIR=%LOCALAPPDATA%');
    expect(launcher).toContain('OMNIKES_CACHE_DIR');
    expect(launcher).toContain('OMNIKES_LOGS_DIR');
    expect(launcher.indexOf('set "LOG_FILE=')).toBeLessThan(launcher.indexOf('>> "%LOG_FILE%"'));
  });

  it('should check the app server and its health endpoint', () => {
    expect(launcher).toContain('server.js');
    expect(launcher).toContain('/api/health');
    expect(launcher).toContain(':3000');
  });

  it('should check the PostgreSQL Windows service and port', () => {
    expect(launcher).toContain('sc.exe query OmniKesPostgreSQL');
    expect(launcher).toContain("'127.0.0.1',5432");
    expect(launcher).toContain('5432');
  });

  it('should fail with explicit diagnostics for missing runtime files', () => {
    expect(runtimeCmd).toContain('runtime Node.js introuvable');
    expect(runtimeCmd).toContain('script d\'installation introuvable');
    expect(runtimeCmd).toContain('runtime PostgreSQL introuvable');
  });

  it('should parse Windows environment lines and write actual newline characters', () => {
    expect(runtimeJs).toContain('.split(/\\r?\\n/)');
    expect(runtimeJs).toContain("password + '\\n'");
    expect(runtimeJs).not.toContain('.split(/\\\\r?\\\\n/)');
    expect(runtimeJs).not.toContain("password + '\\\\n'");
  });

  it('should start and verify PostgreSQL rather than silently ignoring failure', () => {
    expect(runtimeJs).toContain("['start', 'OmniKesPostgreSQL']");
    expect(runtimeJs).toContain('Le service OmniKesPostgreSQL ne répond pas après 30 secondes');
    expect(runtimeJs).toContain("['config', 'OmniKesPostgreSQL', 'start=', 'auto']");
  });

  it('should preserve an existing cluster when credentials are missing', () => {
    expect(runtimeJs).toContain('Aucune donnée n’a été modifiée');
    expect(runtimeJs).toContain("exists(path.join(data, 'PG_VERSION'))");
  });

  it('should retain migrations and Inno Setup launcher configuration', () => {
    expect(runtimeJs).toContain("path.join(app, 'prisma', 'migrations')");
    expect(existsSync(issPath)).toBe(true);
    expect(readFileSync(issPath, 'utf8')).toContain('installer\\OmniKesLauncher.cmd');
  });

  it('should have prepare-user-env.cjs', () => {
    expect(existsSync(path.join(installerPath, 'prepare-user-env.cjs'))).toBe(true);
  });
});
