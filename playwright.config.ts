import { defineConfig, devices } from '@playwright/test';

process.env['AGRIVIO_E2E_API_ORIGIN'] ??= 'http://127.0.0.1:3100';
process.env['AGRIVIO_E2E_WEB_ORIGIN'] ??= 'http://127.0.0.1:4300';

const apiOrigin = process.env['AGRIVIO_E2E_API_ORIGIN'];
const webOrigin = process.env['AGRIVIO_E2E_WEB_ORIGIN'];

/**
 * Playwright owns the E2E application servers on 3100/4300 so developer
 * processes on 3000/4200 are left alone. reuseExistingServer is always false.
 * Backend uses NODE_ENV=test with MONGODB_DB_NAME agrivio_test_e2e (never Agrivio).
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
    baseURL: webOrigin,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
  webServer: [
    {
      command: 'node ./apps/backend/index.js',
      url: `${apiOrigin}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AGRIVIO_APP_PROFILE: 'test',
        AGRIVIO_ALLOW_E2E_BOOTSTRAP: 'true',
        AGRIVIO_SKIP_MONGO: 'true',
        HOST: '127.0.0.1',
        PORT: '3100',
        AGRIVIO_PUBLIC_WEB_BASE_URL: webOrigin,
        MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
        MONGODB_DB_NAME: 'agrivio_test_e2e',
        MONGODB_REPLICA_SET: 'rs0',
        SESSION_SECRET: 'test-session-secret-for-e2e-smoke-ok',
        NODE_OPTIONS: '',
      },
    },
    {
      command:
        'npx nx serve frontend --configuration=development --host=127.0.0.1 --port=4300',
      url: webOrigin,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        PORT: '4300',
        NG_BUILD_CACHE: '0',
      },
    },
  ],
});
