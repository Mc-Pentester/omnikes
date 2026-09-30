import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Set required environment variables for tests
// This is a test-only secret, not for production
process.env.SESSION_SECRET = 'test-secret-for-vitest-environment-only-32chars';

// Cleanup after each test
afterEach(() => {
  cleanup();
});
