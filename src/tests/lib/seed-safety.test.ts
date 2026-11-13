import { describe, expect, it } from 'vitest';
import { assertSafeTestSeedTarget } from '@omnikes/lib/seed-safety';
describe('demo seed safety guard', () => {
  it('allows an explicitly authorized CI/test database', () => expect(() => assertSafeTestSeedTarget('postgresql://ci:ci@127.0.0.1:5432/omnikes_ci', 'true', 'test')).not.toThrow());
  it('requires explicit opt-in', () => expect(() => assertSafeTestSeedTarget('postgresql://localhost:5432/omnikes_test', undefined, 'development')).toThrow(/OMNIKES_ALLOW_TEST_SEED/));
  it('rejects production even if the database name looks like a test database', () => expect(() => assertSafeTestSeedTarget('postgresql://localhost:5432/omnikes_test', 'true', 'production')).toThrow(/NODE_ENV=production/));
  it('rejects ordinary production database names', () => expect(() => assertSafeTestSeedTarget('postgresql://localhost:5432/omnikes', 'true', 'development')).toThrow(/database name/));
});
