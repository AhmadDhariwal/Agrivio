import { defineConfig, devices } from '@playwright/test';

/**
 * F00 Chromium E2E smoke foundation.
 * Proves frontend and backend can start together; not business-feature coverage.
 */
export default defineConfig({
  testDir: './apps/frontend/tests/e2e',
  testMatch: '**/*.e2e.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['list']],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4200',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node ./apps/backend/index.js',
      port: 3000,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AGRIVIO_APP_PROFILE: 'test',
        HOST: '127.0.0.1',
        PORT: '3000',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
        MONGODB_DB_NAME: 'agrivio_test_e2e',
        MONGODB_REPLICA_SET: 'rs0',
        SESSION_SECRET: 'test-session-secret-for-e2e-smoke-ok',
        NODE_OPTIONS: '',
      },
    },
    {
      command: 'npx nx serve frontend --configuration=development --host=127.0.0.1 --port=4200',
      url: 'http://127.0.0.1:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      env: {
        ...process.env,
        NODE_OPTIONS: '',
      },
    },
  ],
});
