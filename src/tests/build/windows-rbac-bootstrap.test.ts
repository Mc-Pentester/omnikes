import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const initializer = readFileSync(path.join(root, 'installer', 'initialize-rbac.cjs'), 'utf8');
const runtime = readFileSync(path.join(root, 'installer', 'install-runtime.cjs'), 'utf8');
const packaging = readFileSync(path.join(root, 'scripts', 'package-windows.ps1'), 'utf8');

describe('Windows installer RBAC bootstrap', () => {
  it('runs the idempotent permission initializer after Prisma migrations', () => {
    expect(runtime).toContain("run(process.execPath, [prismaCli, 'migrate', 'deploy'])");
    expect(runtime).toContain("path.join(__dirname, 'initialize-rbac.cjs')");
    expect(runtime.indexOf("migrate', 'deploy")).toBeLessThan(runtime.indexOf("path.join(__dirname, 'initialize-rbac.cjs')"));
  });

  it('includes the initializer in the offline Windows installer payload', () => {
    expect(packaging).toContain('Copy-Item "installer\\initialize-rbac.cjs" $installer -Force');
  });

  it('upserts the tenant and platform permission catalog without creating tenant data', () => {
    expect(initializer).toContain('tx.permission.upsert');
    expect(initializer).toContain('tx.platformPermission.upsert');
    expect(initializer).toContain("'store.create'");
    expect(initializer).toContain("'supplier.payment.manage'");
    expect(initializer).toContain("'organization.subscription.manage'");
    expect(initializer).toContain('await prisma.permission.count()');
    expect(initializer).not.toMatch(/tx\.(organization|user|role)\.create\s*\(/);
    expect(initializer).not.toContain('deleteMany');
    expect(initializer).not.toContain('drop database');
  });
});
