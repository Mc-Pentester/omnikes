/**
 * Verification test for Prisma packaging in standalone build
 * Verifies that Prisma schema and generated client files are present
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// This suite validates a generated Next.js standalone artifact. The regular CI test
// step runs before the production build, so skip only when no artifact exists; the
// Windows packaging workflow performs its own mandatory post-build verification.
describe.skipIf(!existsSync(path.join(process.cwd(), '.next', 'standalone')))('Prisma Packaging Verification', () => {
  const root = process.cwd();
  const standalonePath = path.join(root, '.next', 'standalone');
  const prismaPath = path.join(standalonePath, 'prisma');
  const prismaClientPath = path.join(standalonePath, 'node_modules', '@prisma', 'client');

  it('should have prisma directory in standalone build', () => {
    expect(existsSync(prismaPath)).toBe(true);
  });

  it('should have schema.prisma in standalone build', () => {
    const schemaPath = path.join(prismaPath, 'schema.prisma');
    expect(existsSync(schemaPath)).toBe(true);
    
    const schemaContent = readFileSync(schemaPath, 'utf8');
    expect(schemaContent).toContain('generator client');
    expect(schemaContent).toContain('datasource db');
  });

  it('should have migrations directory in standalone build', () => {
    const migrationsPath = path.join(prismaPath, 'migrations');
    expect(existsSync(migrationsPath)).toBe(true);
  });

  it('should have Prisma Client in standalone build', () => {
    expect(existsSync(prismaClientPath)).toBe(true);
  });

  it('should have default.js in Prisma Client', () => {
    const defaultPath = path.join(prismaClientPath, 'default.js');
    expect(existsSync(defaultPath)).toBe(true);
    
    const content = readFileSync(defaultPath, 'utf8');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('require');
  });

  it('should have runtime directory in Prisma Client', () => {
    const runtimePath = path.join(prismaClientPath, 'runtime');
    expect(existsSync(runtimePath)).toBe(true);
  });

  it('should have package.json in Prisma Client', () => {
    const packagePath = path.join(prismaClientPath, 'package.json');
    expect(existsSync(packagePath)).toBe(true);
    
    const content = readFileSync(packagePath, 'utf8');
    const pkg = JSON.parse(content);
    expect(pkg.name).toBe('@prisma/client');
  });
});
