import { describe, expect, it } from 'vitest';
import {
  API_AUTH_ACTIVATE_PATH,
  API_AUTH_CSRF_PATH,
  API_CSRF_HEADER,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_SESSION_COOKIE_NAME,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
import { createApp } from '../../app';
import { loadApiEnv } from '../../platform/config/runtime-config';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import { createOnboardingModule } from './onboarding.module';
import { createAuthModule } from '../identity/auth.module';
import { createBridgedAuthStore } from '../identity/auth.bridge-store';
import { hashToken } from '../identity/crypto-tokens';

describe('F02 Phase 1 organization onboarding', () => {
  it('accepts a valid public activation request and rejects invalid payloads', async () => {
    const { server, baseUrl, store, jar } = await boot();

    try {
      const csrf = await issueCsrf(baseUrl, jar);
      const invalid = await fetchJson(
        baseUrl,
        'POST',
        API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
        {
          organizationName: '',
          ownerEmail: 'bad',
        },
        { [API_CSRF_HEADER]: csrf },
        jar,
      );
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe(ApiTransportErrorCode.ValidationFailed);

      const csrf2 = await issueCsrf(baseUrl, jar);
      const created = await fetchJson(
        baseUrl,
        'POST',
        API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
        {
          organizationName: '  Green  Fields  ',
          ownerEmail: 'Owner@Example.com',
          ownerDisplayName: 'Ahmad Owner',
        },
        { [API_CSRF_HEADER]: csrf2 },
        jar,
      );
      expect(created.status).toBe(201);
      expect(created.body.data.status).toBe('pending_approval');
      expect(created.body.data.ownerEmail).toBe('owner@example.com');
      expect(created.body.data).not.toHaveProperty('activationToken');

      const csrf3 = await issueCsrf(baseUrl, jar);
      const duplicate = await fetchJson(
        baseUrl,
        'POST',
        API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
        {
          organizationName: 'Green Fields',
          ownerEmail: 'owner@example.com',
          ownerDisplayName: 'Ahmad Owner',
        },
        { [API_CSRF_HEADER]: csrf3 },
        jar,
      );
      expect(duplicate.status).toBe(200);
      expect(duplicate.body.data.duplicate).toBe(true);
      expect(duplicate.body.data.organizationId).toBe(created.body.data.organizationId);

      const audits = store.listAuditEventsForTest?.() ?? [];
      expect(audits.some((event) => event.action === 'organization.activation_requested')).toBe(
        true,
      );
    } finally {
      await close(server);
    }
  });

  it('approves and rejects with correctly named routes and issues hashed activation tokens', async () => {
    const { server, baseUrl, store, jar } = await boot();

    try {
      const csrf = await issueCsrf(baseUrl, jar);
      const created = await fetchJson(
        baseUrl,
        'POST',
        API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
        {
          organizationName: 'Agri Store',
          ownerEmail: 'owner2@example.com',
          ownerDisplayName: 'Owner Two',
        },
        { [API_CSRF_HEADER]: csrf },
        jar,
      );
      const organizationId = created.body.data.organizationId;

      const forbiddenProd = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${organizationId}/approve`,
        {},
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(forbiddenProd.status).toBe(401);

      const approved = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${organizationId}/approve`,
        {},
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin-1',
        },
        jar,
      );
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('approved');
      expect(approved.body.data.subscriptionStatus).toBe('trial');
      expect(typeof approved.body.data.activationToken).toBe('string');
      expect(approved.body.data.ownerEmail).toBe('owner2@example.com');
      expect(approved.body.data.activationPath).toBe(
        `/activate?token=${encodeURIComponent(approved.body.data.activationToken)}`,
      );
      expect(approved.body.data.activationUrl).toBe(
        `http://localhost:4200/activate?token=${encodeURIComponent(approved.body.data.activationToken)}`,
      );
      expect(JSON.stringify(approved.body)).not.toMatch(/passwordHash|tokenHash/i);

      const tokenHash = hashToken(approved.body.data.activationToken);
      const storedToken = await store.findActivationTokenByHash(tokenHash);
      expect(storedToken).not.toBeNull();
      expect(storedToken?.tokenHash).toBe(tokenHash);
      expect(JSON.stringify(storedToken)).not.toContain(approved.body.data.activationToken);

      const rejectedCreate = await fetchJson(
        baseUrl,
        'POST',
        API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
        {
          organizationName: 'Reject Me',
          ownerEmail: 'reject@example.com',
          ownerDisplayName: 'Reject Owner',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      const rejectId = rejectedCreate.body.data.organizationId;
      const rejected = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${rejectId}/reject`,
        { reason: 'Incomplete paperwork' },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin-1',
        },
        jar,
      );
      expect(rejected.status).toBe(200);
      expect(rejected.body.data.status).toBe('rejected');
      expect(rejected.body.data.reason).toBe('Incomplete paperwork');
    } finally {
      await close(server);
    }
  });

  it('activates owner with password policy, expiry, and single-use token semantics', async () => {
    let current = new Date('2026-08-08T00:00:00.000Z');
    const { server, baseUrl, onboardingService, jar } = await boot({
      now: () => current,
    });

    try {
      const created = await onboardingService.submitActivationRequest({
        organizationName: 'Activate Co',
        ownerEmail: 'activate@example.com',
        ownerDisplayName: 'Activate Owner',
      });
      const approved = await onboardingService.approveOrganization(created.organizationId, {
        actorId: 'super-admin-1',
      });

      const weak = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_ACTIVATE_PATH,
        {
          token: approved.activationToken,
          password: 'short',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(weak.status).toBe(400);

      const common = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_ACTIVATE_PATH,
        {
          token: approved.activationToken,
          password: 'password1234',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(common.status).toBe(400);

      const wrong = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_ACTIVATE_PATH,
        {
          token: 'not-the-token',
          password: 'a-strong-passphrase',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(wrong.status).toBe(403);

      current = new Date('2026-08-10T00:00:00.000Z');
      const expired = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_ACTIVATE_PATH,
        {
          token: approved.activationToken,
          password: 'a-strong-passphrase',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(expired.status).toBe(403);

      current = new Date('2026-08-08T01:00:00.000Z');
      const ok = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_ACTIVATE_PATH,
        {
          token: approved.activationToken,
          password: 'a-strong-passphrase',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(ok.status).toBe(200);
      expect(ok.body.data.status).toBe('active');
      expect(ok.body.data.csrfToken).toBeTruthy();
      expect(jar.get(API_SESSION_COOKIE_NAME)).toBeTruthy();

      const reuse = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_ACTIVATE_PATH,
        {
          token: approved.activationToken,
          password: 'a-strong-passphrase',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(reuse.status).toBe(409);
    } finally {
      await close(server);
    }
  });

  it('reissues activation for approved owner without password and invalidates prior token', async () => {
    const { server, baseUrl, store, onboardingService, jar } = await boot();

    try {
      const created = await onboardingService.submitActivationRequest({
        organizationName: 'Reissue Co',
        ownerEmail: 'reissue@example.com',
        ownerDisplayName: 'Reissue Owner',
      });
      const approved = await onboardingService.approveOrganization(created.organizationId, {
        actorId: 'super-admin-1',
      });
      const firstToken = approved.activationToken;

      const reissued = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${created.organizationId}/reissue-activation`,
        {},
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin-1',
        },
        jar,
      );
      expect(reissued.status).toBe(200);
      expect(reissued.body.data.reissued).toBe(true);
      expect(reissued.body.data.ownerEmail).toBe('reissue@example.com');
      expect(typeof reissued.body.data.activationToken).toBe('string');
      expect(reissued.body.data.activationToken).not.toBe(firstToken);
      expect(reissued.body.data.activationUrl).toContain('/activate?token=');

      const oldHash = hashToken(firstToken);
      const oldStored = await store.findActivationTokenByHash(oldHash);
      expect(oldStored?.consumedAt).toBeTruthy();

      const stale = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_ACTIVATE_PATH,
        {
          token: firstToken,
          password: 'a-strong-passphrase',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(stale.status).toBe(409);

      const ok = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_ACTIVATE_PATH,
        {
          token: reissued.body.data.activationToken,
          password: 'a-strong-passphrase',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(ok.status).toBe(200);

      const blocked = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${created.organizationId}/reissue-activation`,
        {},
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin-1',
        },
        jar,
      );
      expect(blocked.status).toBe(409);
    } finally {
      await close(server);
    }
  });

  it('blocks X-Platform-Actor in production', async () => {
    const onboarding = createOnboardingModule({
      config: { nodeEnv: 'production' },
      persistence: 'memory',
    });
    const auth = createAuthModule({
      config: { nodeEnv: 'production' },
      persistence: 'memory',
      store: createBridgedAuthStore({ identityStore: onboarding.store }),
      onboardingService: onboarding.onboardingService,
    });
    const config = loadApiEnv({
      NODE_ENV: 'production',
      SESSION_SECRET: 'x'.repeat(32),
      MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
      AGRIVIO_PUBLIC_WEB_BASE_URL: 'https://app.example.com',
    });
    const productionConfig = { ...config, nodeEnv: 'production' };
    const app = createApp({
      config: productionConfig,
      database: createMockDatabaseLifecycle({ ready: true }),
      onboarding,
      auth,
    });
    const server = createServer(app);
    await listen(server);

    try {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Expected TCP port');
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const response = await fetchJson(baseUrl, 'GET', API_PLATFORM_ORGANIZATIONS_PATH, undefined, {
        [API_PLATFORM_ACTOR_HEADER]: 'evil',
      });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ApiTransportErrorCode.Forbidden);
    } finally {
      await close(server);
    }
  });
});

async function boot(options = {}) {
  const config = loadApiEnv({ NODE_ENV: 'test' });
  const onboarding = createOnboardingModule({
    config,
    persistence: 'memory',
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const auth = createAuthModule({
    config,
    persistence: 'memory',
    store: createBridgedAuthStore({ identityStore: onboarding.store }),
    onboardingService: onboarding.onboardingService,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const app = createApp({
    config,
    database: createMockDatabaseLifecycle({ ready: true }),
    onboarding,
    auth,
  });
  const server = createServer(app);
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP port');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    store: onboarding.store,
    onboardingService: onboarding.onboardingService,
    jar: createCookieJar(),
  };
}

async function issueCsrf(baseUrl, jar) {
  const response = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.csrfToken;
}

function createCookieJar() {
  const cookies = new Map();
  return {
    get(name) {
      return cookies.get(name);
    },
    absorb(headers) {
      const raw = headers.getSetCookie?.() ?? [];
      for (const entry of raw) {
        const [pair] = entry.split(';');
        const index = pair.indexOf('=');
        if (index > 0) {
          cookies.set(pair.slice(0, index), decodeURIComponent(pair.slice(index + 1)));
        }
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    },
  };
}

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

async function fetchJson(baseUrl, method, path, body, headers = {}, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(jar === undefined ? {} : { cookie: jar.header() }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  jar?.absorb(response.headers);
  const json = await response.json();
  return { status: response.status, body: json };
}
