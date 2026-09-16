import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@omnikes/lib': path.resolve(__dirname, './src/lib'),
      '@omnikes/repositories': path.resolve(__dirname, './src/repositories'),
      '@omnikes/services': path.resolve(__dirname, './src/services'),
    },
  },
});
