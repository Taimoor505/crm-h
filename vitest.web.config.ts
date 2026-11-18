import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Frontend unit tests (lib/**, components/**). Backend tests use vitest.config.ts.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['lib/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}', 'hooks/**/*.test.{ts,tsx}', 'mocks/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./vitest.web.setup.ts'],
  },
});
