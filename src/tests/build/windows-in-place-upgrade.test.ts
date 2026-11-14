import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const installer = readFileSync(path.join(root, 'installer', 'OmniKes.iss'), 'utf8');
const prepare = readFileSync(path.join(root, 'installer', 'prepare-upgrade.ps1'), 'utf8');
const lifecycle = readFileSync(path.join(root, 'scripts', 'test-windows-installer-lifecycle.ps1'), 'utf8');

describe('Windows in-place upgrade safety', () => {
  it('runs a pre-install shutdown hook before Inno Setup replaces runtime files', () => {
    expect(installer).toContain('PrepareToInstall(var NeedsRestart: Boolean): String');
    expect(installer).toContain("Source: \"..\\installer\\prepare-upgrade.ps1\"; DestDir: \"{tmp}\"; Flags: dontcopy");
    expect(installer).toContain("ExtractTemporaryFile('prepare-upgrade.ps1')");
    expect(installer).toContain('prepare-upgrade.log');
  });

  it('stops only processes belonging to this installation and its PostgreSQL service', () => {
    expect(prepare).toContain("Get-Service -Name 'OmniKesPostgreSQL'");
    expect(prepare).toContain("Stop-Service -Name 'OmniKesPostgreSQL'");
    expect(prepare).toContain("Name = 'postgres.exe'");
    expect(prepare).toContain('refusing to replace locked runtime files');
    expect(prepare).not.toContain('pg_ctl');
    expect(prepare).not.toContain('Remove-Item');
    expect(prepare).not.toContain('sc.exe delete');
  });

  it('keeps the database preservation assertion in the real second-install lifecycle test', () => {
    expect(lifecycle).toContain('Install-OmniKes');
    expect(lifecycle).toContain('IN-PLACE UPGRADE + DATABASE AND APPLICATION HEALTH: PASS');
    expect(lifecycle).toContain('must-survive-upgrade');
  });
});
