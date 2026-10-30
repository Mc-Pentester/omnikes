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

  it('should have OmniKesLauncher.cmd', () => {
    expect(existsSync(launcherPath)).toBe(true);
  });

  it('should configure OMNIKES_HOME correctly', () => {
    expect(readFileSync(launcherPath, 'utf8')).toContain('OMNIKES_HOME=%~dp0..');
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
  });

  it('should wait for application health', () => {
    expect(readFileSync(launcherPath, 'utf8')).toContain('/api/health');
  });

  it('should register, start, and verify the PostgreSQL Windows service during installation', () => {
    const content = readFileSync(runtimeInstallerPath, 'utf8');
    expect(content).toContain("['register', '-D', data, '-N', serviceName, '-S', 'auto'");
    expect(content).toContain("['start', serviceName]");
    expect(content).toContain('waitForPostgres(password)');
    expect(content).toContain('serviceState()');
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
    expect(content).toContain('installer\\\\OmniKesLauncher.cmd');
    expect(content).toContain('install-runtime.cmd');
    expect(content).toContain('PrivilegesRequired=admin');
  });
});
