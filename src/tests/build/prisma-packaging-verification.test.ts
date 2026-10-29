/**
 * Verification test for Prisma packaging in the Windows standalone build.
 * Checks both Next's standalone trace and the final staged installer application.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The Windows packaging workflow runs this suite after package:windows has completed.
describe('Prisma Packaging Verification', () => {
  const root = process.cwd();
  const standalonePath = path.join(root, '.next', 'standalone');
  const standalonePrismaPath = path.join(standalonePath, 'prisma');
  const standaloneClientPath = path.join(standalonePath, 'node_modules', '@prisma', 'client');
  const stagedAppPath = path.join(root, 'dist', 'windows', 'app');
  const stagedSchemaPath = path.join(stagedAppPath, 'prisma', 'schema.prisma');
  const stagedGeneratedClientPath = path.join(stagedAppPath, 'node_modules', '.prisma', 'client');
  const nextGeneratedClientPath = path.join(stagedAppPath, '.next', 'node_modules', '.prisma', 'client');

  it('should have Prisma schema in the standalone build', () => {
    expect(existsSync(standalonePrismaPath)).toBe(true);
    const schemaPath = path.join(standalonePrismaPath, 'schema.prisma');
    expect(existsSync(schemaPath)).toBe(true);

    const schemaContent = readFileSync(schemaPath, 'utf8');
    expect(schemaContent).toContain('generator client');
    expect(schemaContent).toContain('datasource db');
  });

  it('should have migrations directory in the standalone build', () => {
    expect(existsSync(path.join(standalonePrismaPath, 'migrations'))).toBe(true);
  });

  it('should include Prisma Client package files in the standalone build', () => {
    expect(existsSync(standaloneClientPath)).toBe(true);
    expect(existsSync(path.join(standaloneClientPath, 'default.js'))).toBe(true);
    expect(existsSync(path.join(standaloneClientPath, 'runtime'))).toBe(true);

    const packagePath = path.join(standaloneClientPath, 'package.json');
    expect(existsSync(packagePath)).toBe(true);
    expect(JSON.parse(readFileSync(packagePath, 'utf8')).name).toBe('@prisma/client');
  });

  it('should include schema and generated Prisma Client in the final staged Windows app', () => {
    expect(existsSync(stagedAppPath)).toBe(true);
    expect(existsSync(stagedSchemaPath)).toBe(true);
    expect(existsSync(path.join(stagedGeneratedClientPath, 'default.js'))).toBe(true);
  });

  it('should include the generated Prisma Client in Next traced module resolution when present', () => {
    const nextNodeModules = path.join(stagedAppPath, '.next', 'node_modules');
    if (existsSync(nextNodeModules)) {
      expect(existsSync(path.join(nextGeneratedClientPath, 'default.js'))).toBe(true);
    }
  });
});
