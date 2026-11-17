import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const installer = readFileSync(path.join(root, 'installer', 'OmniKes.iss'), 'utf8');
const license = readFileSync(path.join(root, 'docs', 'legal', 'OMNIKES-LICENSE.txt'), 'utf8');
const lifecycle = readFileSync(path.join(root, 'scripts', 'test-windows-installer-lifecycle.ps1'), 'utf8');

describe('OmniKes installer license acceptance', () => {
  it('displays the complete Kodyra Technologies license through the standard Inno Setup license page', () => {
    expect(installer).toContain('LicenseFile=..\\docs\\legal\\OMNIKES-LICENSE.txt');
    // Inno Setup's built-in license page requires the user to accept before Next
    // becomes available. Do not rely on the unsupported LicenseForceSelection directive.
    expect(installer).not.toMatch(/^\s*LicenseForceSelection\s*=/im);
    expect(license).toContain('Éditeur : Kodyra Technologies');
    expect(license).toContain('Entrée en vigueur : date de l’installation');
    expect(license).toContain('ARTICLE 14 – ACCEPTATION ÉLECTRONIQUE');
  });

  it('requires an explicit acceptance switch for silent installs', () => {
    expect(installer).toContain('if WizardSilent and (not HasExplicitLicenseAcceptanceSwitch()) then');
    expect(installer).toContain("CompareText(ParamStr(I), '/ACCEPTLICENSE=yes') = 0");
    expect(lifecycle).toContain('Silent installation without explicit license acceptance was not rejected.');
  });

  it('records every acceptance locally with version, timestamp, Windows account and method', () => {
    expect(installer).toContain(String.raw`AcceptanceLog := ExpandConstant('{commonappdata}\OmniKes\legal\license-acceptance.log');`);
    expect(installer).toContain('ContractVersion={#LicenseVersion}');
    expect(installer).toContain('AcceptedAtLocal=');
    expect(installer).toContain('WindowsUser=');
    expect(installer).toContain('AcceptanceMethod=');
    expect(installer).toContain('SaveStringToFile(AcceptanceLog, AcceptanceRecord, True)');
    expect(installer).toContain('if CurStep = ssInstall then');
  });

  it('passes and verifies explicit acceptance in the silent Windows lifecycle test', () => {
    expect(lifecycle).toContain("'/ACCEPTLICENSE=yes'");
    expect(lifecycle).toContain('license-acceptance.log');
    expect(lifecycle).toContain('ExplicitSilentCommandLine');
    expect(lifecycle).toContain('ContractVersion=1.0');
    expect(lifecycle).toContain('Expected the in-place upgrade to append a second license acceptance record');
  });
});
