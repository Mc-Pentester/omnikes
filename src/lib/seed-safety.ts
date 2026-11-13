const TEST_DATABASE_NAME = /(?:^|[_-])(?:test|tests|testing|ci)(?:[_-]|$)/i;
export function assertSafeTestSeedTarget(databaseUrl: string | undefined, explicitOptIn: string | undefined, nodeEnv: string | undefined): void {
  if (nodeEnv === 'production') throw new Error('Refusing to run the demo seed in NODE_ENV=production.');
  if (explicitOptIn !== 'true') throw new Error('Demo seed disabled. Set OMNIKES_ALLOW_TEST_SEED=true only for a disposable test database.');
  if (!databaseUrl) throw new Error('DATABASE_URL is required to run the demo seed.');
  let databaseName: string;
  try { databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\\/+/, '')); }
  catch { throw new Error('DATABASE_URL is invalid; refusing to run the demo seed.'); }
  if (!databaseName || !TEST_DATABASE_NAME.test(databaseName)) throw new Error('Refusing to run the demo seed: database name must explicitly contain a test/testing/ci segment.');
}
