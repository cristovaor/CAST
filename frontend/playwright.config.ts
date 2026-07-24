import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost',
    storageState: process.env.E2E_STORAGE_STATE,
    trace: 'retain-on-failure',
  },
  timeout: 10 * 60 * 1000,
});
