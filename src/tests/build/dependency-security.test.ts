import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('production dependency security baseline', () => {
  it('pins Next.js to the patched release in the manifest and lockfile', () => {
    const root = process.cwd();
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

    expect(manifest.dependencies.next).toBe('16.4.6');
    expect(lock.packages[''].dependencies.next).toBe('16.4.6');
    expect(lock.packages['node_modules/next'].version).toBe('16.4.6');
    expect(manifest.devDependencies['eslint-config-next']).toBe('16.4.6');
    expect(lock.packages['node_modules/eslint-config-next'].version).toBe('16.4.6');
    expect(manifest.overrides['@next/eslint-plugin-next']).toBe('16.4.6');
    expect(lock.packages['node_modules/@next/eslint-plugin-next'].version).toBe('16.4.6');
  });
});
