import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { API_AUTH_CSRF_PATH } from '@agrivio/api-contracts';
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
