/**
 * Verification test for Windows launcher configuration
 * Verifies that launcher scripts are correctly configured
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('Windows Launcher Verification', () => {
  const root = process.cwd();
  const installerPath = path.join(root, 'installer');
  const launcherPath = path.join(installerPath, 'OmniKesLauncher.cmd');
  const issPath = path.join(installerPath, 'OmniKes.iss');

  it('should have OmniKesLauncher.cmd', () => {
    expect(existsSync(launcherPath)).toBe(true);
  });

  it('should configure OMNIKES_HOME correctly', () => {
    const content = readFileSync(launcherPath, 'utf8');
    expect(content).toContain('OMNIKES_HOME=%~dp0..');
  });

  it('should create user-writable directories', () => {
    const content = readFileSync(launcherPath, 'utf8');
    expect(content).toContain('OMNIKES_DATA_DIR=%LOCALAPPDATA%');
    expect(content).toContain('OMNIKES_CACHE_DIR');
    expect(content).toContain('OMNIKES_LOGS_DIR');
  });

  it('should check for existing instance on port 3000', () => {
    const content = readFileSync(launcherPath, 'utf8');
    expect(content).toContain('netstat -ano');
    expect(content).toContain(':3000');
  });

  it('should check for PostgreSQL on port 5432', () => {
    const content = readFileSync(launcherPath, 'utf8');
    expect(content).toContain(':5432');
  });

  it('should wait for server health check', () => {
    const content = readFileSync(launcherPath, 'utf8');
    expect(content).toContain('/api/health');
  });

  it('should have logging configuration', () => {
    const content = readFileSync(launcherPath, 'utf8');
    expect(content).toContain('LOG_FILE');
  });

  it('should have OmniKes.iss configuration', () => {
    expect(existsSync(issPath)).toBe(true);
  });

  it('should configure correct launcher path in Inno Setup', () => {
    const content = readFileSync(issPath, 'utf8');
    expect(content).toContain('installer\\OmniKesLauncher.cmd');
  });

  it('should have prepare-user-env.cjs', () => {
    const prepareEnvPath = path.join(installerPath, 'prepare-user-env.cjs');
    expect(existsSync(prepareEnvPath)).toBe(true);
  });
});
