import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Load local environment files for PostgreSQL integration tests.
// Existing process environment variables always take precedence.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // .env.local is optional.
  }

  try {
    process.loadEnvFile('.env');
  } catch {
    // .env is optional; unit/security tests do not require DATABASE_URL.
  }
}

// Set required environment variables for tests.
// This is a test-only secret, not for production.
process.env.SESSION_SECRET = 'test-secret-for-vitest-environment-only-32chars';

// Cleanup after each test.
afterEach(() => {
  cleanup();
});
