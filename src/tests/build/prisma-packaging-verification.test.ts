/**
 * Verify Prisma assets in the distributable Windows application package.
 *
 * The general CI test suite runs before a production/Windows package is built.
 * In that context there is no artifact to inspect, so these packaging checks
 * are skipped. The Windows installer workflow runs this test after
 * scripts/package-windows.ps1 creates dist/windows/app.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packagedAppPath = path.join(root, 'dist', 'windows', 'app');
const packageReady = existsSync(path.join(packagedAppPath, 'server.js'));
const prismaPath = path.join(packagedAppPath, 'prisma');
const prismaClientPath = path.join(packagedAppPath, 'node_modules', '@prisma', 'client');

describe.skipIf(!packageReady)('Prisma Packaging Verification', () => {
  it('includes the Prisma directory in the packaged application', () => {
    expect(existsSync(prismaPath)).toBe(true);
  });

  it('includes a valid schema.prisma in the packaged application', () => {
    const schemaPath = path.join(prismaPath, 'schema.prisma');
    expect(existsSync(schemaPath)).toBe(true);

    const schemaContent = readFileSync(schemaPath, 'utf8');
    expect(schemaContent).toContain('generator client');
    expect(schemaContent).toContain('datasource db');
  });

  it('includes the Prisma migrations directory in the package', () => {
    expect(existsSync(path.join(prismaPath, 'migrations'))).toBe(true);
  });

  it('includes Prisma Client in the packaged dependencies', () => {
    expect(existsSync(prismaClientPath)).toBe(true);
  });

  it('includes a non-empty default.js entry point for Prisma Client', () => {
    const defaultPath = path.join(prismaClientPath, 'default.js');
    expect(existsSync(defaultPath)).toBe(true);

    const content = readFileSync(defaultPath, 'utf8');
    expect(content.trim().length).toBeGreaterThan(0);
    expect(content).toContain('require');
  });

  it('includes the Prisma Client runtime directory', () => {
    expect(existsSync(path.join(prismaClientPath, 'runtime'))).toBe(true);
  });

  it('includes the correct Prisma Client package metadata', () => {
    const packagePath = path.join(prismaClientPath, 'package.json');
    expect(existsSync(packagePath)).toBe(true);

    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    expect(pkg.name).toBe('@prisma/client');
  });
});
