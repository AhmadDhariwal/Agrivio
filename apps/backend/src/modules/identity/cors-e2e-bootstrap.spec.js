import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import {
  API_AUTH_CSRF_PATH,
  API_CSRF_HEADER,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
} from '@agrivio/api-contracts';
import { createApp } from '../../app';
import { loadApiEnv } from '../../platform/config/runtime-config';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import {
  E2E_SUPER_ADMIN_EMAIL,
  E2E_SUPER_ADMIN_PASSWORD,
} from '../../platform/testing/e2e-bootstrap.routes';

describe('F02 Phase 6 CORS and E2E bootstrap', () => {
  it('emits CORS credentials headers for allowlisted browser origins', async () => {
    const config = loadApiEnv({ NODE_ENV: 'test' });
    const app = createApp({
      config,
      database: createMockDatabaseLifecycle({ ready: true }),
    });
    const server = createServer(app);
    await listen(server);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected TCP port');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(`${baseUrl}${API_AUTH_CSRF_PATH}`, {
        method: 'POST',
        headers: {
          origin: 'http://localhost:4200',
          'content-type': 'application/json',
        },
        body: '{}',
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:4200');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');

      const denied = await fetch(`${baseUrl}${API_AUTH_CSRF_PATH}`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.example',
        },
      });
      expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      await close(server);
    }
  });

  it('allows localhost:4400 credentialed CORS without E2E bootstrap', async () => {
    const config = loadApiEnv({ NODE_ENV: 'test' });
    expect(config.allowE2eBootstrap).toBe(false);

    const app = createApp({
      config,
      database: createMockDatabaseLifecycle({ ready: true }),
    });
    const server = createServer(app);
    await listen(server);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected TCP port');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const preflight = await fetch(`${baseUrl}${API_AUTH_CSRF_PATH}`, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:4400',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-csrf-token',
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:4400');
      expect(preflight.headers.get('access-control-allow-credentials')).toBe('true');

      const response = await fetch(`${baseUrl}${API_AUTH_CSRF_PATH}`, {
        method: 'POST',
        headers: {
          origin: 'http://localhost:4400',
          'content-type': 'application/json',
        },
        body: '{}',
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:4400');
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      const body = await response.json();
      expect(typeof body.data.csrfToken).toBe('string');
    } finally {
      await close(server);
    }
  });

  it('does not emit CORS credentials for localhost:4400 in production', async () => {
    const config = loadApiEnv({
      NODE_ENV: 'production',
      SESSION_SECRET: 'production-session-secret-with-32chars',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
      AGRIVIO_PUBLIC_WEB_BASE_URL: 'https://app.example.com',
      AGRIVIO_SMTP_HOST: 'smtp.example.com',
      AGRIVIO_SMTP_FROM: 'noreply@example.com',
    });
    expect(config.allowLoopbackBrowserOrigins).toBe(false);

    const app = createApp({
      config,
      database: createMockDatabaseLifecycle({ ready: true }),
    });
    const server = createServer(app);
    await listen(server);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected TCP port');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(`${baseUrl}${API_AUTH_CSRF_PATH}`, {
        method: 'POST',
        headers: {
          origin: 'http://localhost:4400',
          'content-type': 'application/json',
        },
        body: '{}',
      });
      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      await close(server);
    }
  });

  it('supports the staging cross-site pre-auth CSRF flow with a Secure SameSite=None session cookie', async () => {
    const webOrigin = 'https://agrivio-staging-web.pages.dev';
    const config = loadApiEnv({
      NODE_ENV: 'production',
      AGRIVIO_APP_PROFILE: 'staging',
      SESSION_SECRET: 'production-session-secret-with-32chars',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
      AGRIVIO_PUBLIC_WEB_BASE_URL: webOrigin,
      AGRIVIO_SMTP_HOST: 'smtp.example.com',
      AGRIVIO_SMTP_FROM: 'noreply@example.com',
    });
    const app = createApp({
      config,
      database: createMockDatabaseLifecycle({ ready: true }),
      onboardingPersistence: 'memory',
      authPersistence: 'memory',
      subscriptionPersistence: 'memory',
    });
    const server = createServer(app);
    await listen(server);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected TCP port');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const csrfResponse = await fetch(`${baseUrl}${API_AUTH_CSRF_PATH}`, {
        method: 'POST',
        headers: { origin: webOrigin, 'content-type': 'application/json' },
        body: '{}',
      });
      expect(csrfResponse.status).toBe(200);
      expect(csrfResponse.headers.get('access-control-allow-origin')).toBe(webOrigin);
      expect(csrfResponse.headers.get('access-control-allow-credentials')).toBe('true');

      const setCookie = csrfResponse.headers.getSetCookie();
      expect(setCookie).toHaveLength(1);
      expect(setCookie[0]).toMatch(/agrivio_session=/);
      expect(setCookie[0]).toMatch(/HttpOnly/i);
      expect(setCookie[0]).toMatch(/Secure/i);
      expect(setCookie[0]).toMatch(/SameSite=None/i);
      const cookie = setCookie[0].split(';')[0];
      const csrfBody = await csrfResponse.json();
      const csrfToken = csrfBody.data.csrfToken;

      const missingCookie = await fetch(
        `${baseUrl}${API_ORGANIZATION_ACTIVATION_REQUESTS_PATH}`,
        {
          method: 'POST',
          headers: {
            origin: webOrigin,
            'content-type': 'application/json',
            [API_CSRF_HEADER]: csrfToken,
          },
          body: JSON.stringify({
            organizationName: 'Missing Cookie Farm',
            ownerEmail: 'missing-cookie@example.com',
            ownerDisplayName: 'Missing Cookie Owner',
          }),
        },
      );
      expect(missingCookie.status).toBe(403);
      const missingBody = await missingCookie.json();
      expect(missingBody.error.message).toBe('CSRF validation failed');

      const mismatchedCsrf = await fetch(
        `${baseUrl}${API_ORGANIZATION_ACTIVATION_REQUESTS_PATH}`,
        {
          method: 'POST',
          headers: {
            origin: webOrigin,
            cookie,
            'content-type': 'application/json',
            [API_CSRF_HEADER]: 'mismatched-csrf-token',
          },
          body: JSON.stringify({
            organizationName: 'Mismatched CSRF Farm',
            ownerEmail: 'mismatched-csrf@example.com',
            ownerDisplayName: 'Mismatched CSRF Owner',
          }),
        },
      );
      expect(mismatchedCsrf.status).toBe(403);
      const mismatchedBody = await mismatchedCsrf.json();
      expect(mismatchedBody.error.message).toBe('CSRF validation failed');

      const rotatedCsrfRes = await fetch(`${baseUrl}${API_AUTH_CSRF_PATH}`, {
        method: 'POST',
        headers: { origin: webOrigin, cookie, 'content-type': 'application/json' },
        body: '{}',
      });
      expect(rotatedCsrfRes.status).toBe(200);
      const rotatedBody = await rotatedCsrfRes.json();
      const newCsrfToken = rotatedBody.data.csrfToken;
      expect(newCsrfToken).not.toBe(csrfToken);

      const staleCsrf = await fetch(
        `${baseUrl}${API_ORGANIZATION_ACTIVATION_REQUESTS_PATH}`,
        {
          method: 'POST',
          headers: {
            origin: webOrigin,
            cookie,
            'content-type': 'application/json',
            [API_CSRF_HEADER]: csrfToken,
          },
          body: JSON.stringify({
            organizationName: 'Stale CSRF Farm',
            ownerEmail: 'stale-csrf@example.com',
            ownerDisplayName: 'Stale CSRF Owner',
          }),
        },
      );
      expect(staleCsrf.status).toBe(403);
      const staleBody = await staleCsrf.json();
      expect(staleBody.error.message).toBe('CSRF validation failed');

      const submitted = await fetch(`${baseUrl}${API_ORGANIZATION_ACTIVATION_REQUESTS_PATH}`, {
        method: 'POST',
        headers: {
          origin: webOrigin,
          cookie,
          'content-type': 'application/json',
          [API_CSRF_HEADER]: newCsrfToken,
        },
        body: JSON.stringify({
          organizationName: 'Cross Site Farm',
          ownerEmail: 'cross-site@example.com',
          ownerDisplayName: 'Cross Site Owner',
        }),
      });
      expect(submitted.status).toBe(201);

      const activateMissingCookie = await fetch(`${baseUrl}/api/v1/auth/activate`, {
        method: 'POST',
        headers: {
          origin: webOrigin,
          'content-type': 'application/json',
          [API_CSRF_HEADER]: newCsrfToken,
        },
        body: JSON.stringify({ token: 'dummy-token', password: 'Password123456!' }),
      });
      expect(activateMissingCookie.status).toBe(403);
      const activateMissingBody = await activateMissingCookie.json();
      expect(activateMissingBody.error.message).toBe('CSRF validation failed');

      const activateWithCookie = await fetch(`${baseUrl}/api/v1/auth/activate`, {
        method: 'POST',
        headers: {
          origin: webOrigin,
          cookie,
          'content-type': 'application/json',
          [API_CSRF_HEADER]: newCsrfToken,
        },
        body: JSON.stringify({ token: 'dummy-token', password: 'Password123456!' }),
      });
      expect(activateWithCookie.status).toBe(403);
      const activateWithBody = await activateWithCookie.json();
      expect(activateWithBody.error.message).toBe('Activation token is invalid');
    } finally {
      await close(server);
    }
  });

  it('seeds Super Admin only when E2E bootstrap is explicitly enabled outside production', async () => {
    const config = loadApiEnv({
      NODE_ENV: 'test',
      AGRIVIO_ALLOW_E2E_BOOTSTRAP: 'true',
    });
    expect(config.allowE2eBootstrap).toBe(true);
    const app = createApp({
      config,
      database: createMockDatabaseLifecycle({ ready: true }),
    });
    const server = createServer(app);
    await listen(server);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected TCP port');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(`${baseUrl}/api/v1/test/e2e/bootstrap`, { method: 'POST' });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.superAdmin.email).toBe(E2E_SUPER_ADMIN_EMAIL);
      expect(body.data.superAdmin.password).toBe(E2E_SUPER_ADMIN_PASSWORD);

      expect(() =>
        loadApiEnv({
          NODE_ENV: 'production',
          AGRIVIO_ALLOW_E2E_BOOTSTRAP: 'true',
          SESSION_SECRET: 'production-session-secret-with-32chars',
          MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
          AGRIVIO_PUBLIC_WEB_BASE_URL: 'https://app.example.com',
          AGRIVIO_SMTP_HOST: 'smtp.example.com',
          AGRIVIO_SMTP_FROM: 'noreply@example.com',
        }),
      ).toThrow(/AGRIVIO_ALLOW_E2E_BOOTSTRAP/);
    } finally {
      await close(server);
    }
  });
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}
