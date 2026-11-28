import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'windows-installer.yml'), 'utf8');
const packaging = readFileSync(path.join(root, 'scripts', 'package-windows.ps1'), 'utf8');
const installer = readFileSync(path.join(root, 'installer', 'OmniKes.iss'), 'utf8');
const layout = readFileSync(path.join(root, 'src', 'app', 'layout.tsx'), 'utf8');
const versionModule = readFileSync(path.join(root, 'src', 'lib', 'app-version.ts'), 'utf8');

describe('release tag application version consistency', () => {
  it('derives the application version from the normalized release tag', () => {
    expect(workflow).toContain("$appVersion = $tag -replace '^[vV]', ''");
    expect(workflow).toContain('APP_VERSION=$appVersion');
    expect(workflow).toContain('RELEASE_TAG=$tag');
  });

  it('synchronizes npm metadata and embeds the version in the production build', () => {
    expect(packaging).toContain('npm.cmd version $appVersion --no-git-tag-version --allow-same-version');
    expect(packaging).toContain('$env:NEXT_PUBLIC_APP_VERSION = $appVersion');
    expect(packaging).toContain('Windows PowerShell 5.1 ConvertFrom-Json can reject valid npm lockfiles');
    expect(packaging).toContain('const packageMetadata = JSON.parse(fs.readFileSync(packagePath, "utf8"));');
    expect(packaging).toContain('const lockMetadata = JSON.parse(fs.readFileSync(lockPath, "utf8"));');
    expect(packaging).toContain('lockMetadata.packages[""]');
    expect(packaging).toContain('OMNIKES_EXPECTED_APP_VERSION');
    expect(packaging).toContain('if (version !== expectedVersion)');
    expect(packaging).toContain('process.exit(1)');
    expect(packaging).toContain('Staged npm metadata verified:');
    expect(packaging).toContain('OmniKes-Setup-$appVersion-x64.exe');
  });

  it('requires the version passed by the packaging script instead of a hard-coded installer version', () => {
    expect(installer).toContain('#ifndef MyAppVersion');
    expect(installer).toContain('MyAppVersion must be supplied by scripts/package-windows.ps1');
    expect(installer).toContain('AppVersion={#MyAppVersion}');
    expect(installer).toContain('OutputBaseFilename=OmniKes-Setup-{#MyAppVersion}-x64');
    expect(installer).not.toContain('#define MyAppVersion "0.1.1"');
  });

  it('shows the exact build-time version inside the installed application', () => {
    expect(versionModule).toContain('process.env.NEXT_PUBLIC_APP_VERSION');
    expect(layout).toContain('OmniKès · v{APP_VERSION}');
  });
});
