import { defineConfig, devices } from '@playwright/test';

/**
 * Chromium E2E foundation for F00 smoke + F02 onboarding vertical slice.
 * Backend uses in-memory persistence under NODE_ENV=test.
 * AGRIVIO_SKIP_MONGO allows local runs without Docker replica-set evidence.
 */
export default defineConfig({
  testDir: './apps/frontend/tests/e2e',
  testMatch: '**/*.e2e.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://localhost:4200',
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
      url: 'http://localhost:3000/api/v1/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AGRIVIO_APP_PROFILE: 'test',
        AGRIVIO_ALLOW_E2E_BOOTSTRAP: 'true',
        AGRIVIO_SKIP_MONGO: 'true',
        HOST: 'localhost',
        PORT: '3000',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
        MONGODB_DB_NAME: 'agrivio_test_e2e',
        MONGODB_REPLICA_SET: 'rs0',
        SESSION_SECRET: 'test-session-secret-for-e2e-smoke-ok',
        NODE_OPTIONS: '',
      },
    },
    {
      command: 'npx nx serve frontend --configuration=development --host=localhost --port=4200',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        PORT: '4200',
      },
    },
  ],
});
