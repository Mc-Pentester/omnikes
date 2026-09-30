import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@omnikes/app': path.resolve(__dirname, './src/app'),
      '@omnikes/lib': path.resolve(__dirname, './src/lib'),
      '@omnikes/repositories': path.resolve(__dirname, './src/repositories'),
      '@omnikes/services': path.resolve(__dirname, './src/services'),
    },
  },
});
