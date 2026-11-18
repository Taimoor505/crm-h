import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/crm_test';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // One shared database and job queue: run files one after another.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: TEST_DB,
      SUPABASE_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
      APP_URL: 'https://crm.test',
      DATABASE_POOL_MAX: '4',
    },
  },
});
