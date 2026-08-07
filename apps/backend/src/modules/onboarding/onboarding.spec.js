import { describe, expect, it } from 'vitest';
import {
  API_AUTH_ACTIVATE_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
import { createApp } from '../../app';
import { loadApiEnv } from '../../platform/config/runtime-config';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import { createOnboardingModule } from './onboarding.module';
import { hashToken } from '../identity/crypto-tokens';

describe('F02 Phase 1 organization onboarding', () => {
  it('accepts a valid public activation request and rejects invalid payloads', async () => {
    const { server, baseUrl, store } = await boot();

    try {
      const invalid = await fetchJson(baseUrl, 'POST', API_ORGANIZATION_ACTIVATION_REQUESTS_PATH, {
        organizationName: '',
        ownerEmail: 'bad',
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe(ApiTransportErrorCode.ValidationFailed);

      const created = await fetchJson(baseUrl, 'POST', API_ORGANIZATION_ACTIVATION_REQUESTS_PATH, {
        organizationName: '  Green  Fields  ',
        ownerEmail: 'Owner@Example.com',
        ownerDisplayName: 'Ahmad Owner',
      });
      expect(created.status).toBe(201);
      expect(created.body.data.status).toBe('pending_approval');
      expect(created.body.data.ownerEmail).toBe('owner@example.com');
      expect(created.body.data).not.toHaveProperty('activationToken');

      const duplicate = await fetchJson(baseUrl, 'POST', API_ORGANIZATION_ACTIVATION_REQUESTS_PATH, {
        organizationName: 'Green Fields',
        ownerEmail: 'owner@example.com',
        ownerDisplayName: 'Ahmad Owner',
      });
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
    const { server, baseUrl, store } = await boot();

    try {
      const created = await fetchJson(baseUrl, 'POST', API_ORGANIZATION_ACTIVATION_REQUESTS_PATH, {
        organizationName: 'Agri Store',
        ownerEmail: 'owner2@example.com',
        ownerDisplayName: 'Owner Two',
      });
      const organizationId = created.body.data.organizationId;

      const forbiddenProd = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${organizationId}/approve`,
        {},
        {},
      );
      expect(forbiddenProd.status).toBe(401);

      const approved = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${organizationId}/approve`,
        {},
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin-1' },
      );
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('approved');
      expect(approved.body.data.subscriptionStatus).toBe('trial');
      expect(typeof approved.body.data.activationToken).toBe('string');

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
      );
      const rejectId = rejectedCreate.body.data.organizationId;
      const rejected = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_ORGANIZATIONS_PATH}/${rejectId}/reject`,
        { reason: 'Incomplete paperwork' },
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin-1' },
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
    const { server, baseUrl, onboardingService } = await boot({
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

      const weak = await fetchJson(baseUrl, 'POST', API_AUTH_ACTIVATE_PATH, {
        token: approved.activationToken,
        password: 'short',
      });
      expect(weak.status).toBe(400);

      const common = await fetchJson(baseUrl, 'POST', API_AUTH_ACTIVATE_PATH, {
        token: approved.activationToken,
        password: 'password1234',
      });
      expect(common.status).toBe(400);

      const wrong = await fetchJson(baseUrl, 'POST', API_AUTH_ACTIVATE_PATH, {
        token: 'not-the-token',
        password: 'a-strong-passphrase',
      });
      expect(wrong.status).toBe(403);

      current = new Date('2026-08-10T00:00:00.000Z');
      const expired = await fetchJson(baseUrl, 'POST', API_AUTH_ACTIVATE_PATH, {
        token: approved.activationToken,
        password: 'a-strong-passphrase',
      });
      expect(expired.status).toBe(403);

      current = new Date('2026-08-08T01:00:00.000Z');
      const ok = await fetchJson(baseUrl, 'POST', API_AUTH_ACTIVATE_PATH, {
        token: approved.activationToken,
        password: 'a-strong-passphrase',
      });
      expect(ok.status).toBe(200);
      expect(ok.body.data.status).toBe('active');

      const reuse = await fetchJson(baseUrl, 'POST', API_AUTH_ACTIVATE_PATH, {
        token: approved.activationToken,
        password: 'a-strong-passphrase',
      });
      expect(reuse.status).toBe(409);
    } finally {
      await close(server);
    }
  });

  it('blocks X-Platform-Actor in production', async () => {
    const onboarding = createOnboardingModule({
      config: { nodeEnv: 'production' },
      persistence: 'memory',
    });
    const config = loadApiEnv({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), MONGODB_URI: 'mongodb://127.0.0.1:27017/?replicaSet=rs0' });
    // Force production nodeEnv on config used by middleware
    const productionConfig = { ...config, nodeEnv: /** @type {const} */ ('production') };
    const app = createApp({
      config: productionConfig,
      database: createMockDatabaseLifecycle({ ready: true }),
      onboarding,
      onboardingPersistence: 'memory',
    });
    const server = createServer(app);
    await listen(server);

    try {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Expected TCP port');
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const response = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_ORGANIZATIONS_PATH,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'evil' },
      );
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ApiTransportErrorCode.Forbidden);
    } finally {
      await close(server);
    }
  });
});

/**
 * @param {{ now?: () => Date }} [options]
 */
async function boot(options = {}) {
  const config = loadApiEnv({ NODE_ENV: 'test' });
  const onboarding = createOnboardingModule({
    config,
    persistence: 'memory',
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const app = createApp({
    config,
    database: createMockDatabaseLifecycle({ ready: true }),
    onboarding,
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
  };
}

/**
 * @param {import('node:http').Server} server
 */
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}

/**
 * @param {import('node:http').Server} server
 */
function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 * @param {Record<string, string>} [headers]
 */
async function fetchJson(baseUrl, method, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json();
  return { status: response.status, body: json };
}
