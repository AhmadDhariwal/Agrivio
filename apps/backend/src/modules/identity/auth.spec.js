import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_AUTH_PASSWORD_RESET_CONFIRM_PATH,
  API_AUTH_PASSWORD_RESET_REQUEST_PATH,
  API_AUTH_SESSION_PATH,
  API_CSRF_HEADER,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_SESSION_COOKIE_NAME,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
import { createApp } from '../../app';
import { loadApiEnv } from '../../platform/config/runtime-config';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import { createOnboardingModule } from '../onboarding/onboarding.module';
import { createAuthModule } from './auth.module';
import { createBridgedAuthStore } from './auth.bridge-store';
import { hashPassword } from './password.service';
import { hashToken } from './crypto-tokens';

describe('F02 Phase 2 session authentication', () => {
  it('issues CSRF, logs in, exposes session context, and logs out', async () => {
    const { server, baseUrl, jar, authStore } = await boot();

    try {
      const csrf = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
      expect(csrf.status).toBe(200);
      expect(typeof csrf.body.data.csrfToken).toBe('string');
      expect(jar.get(API_SESSION_COOKIE_NAME)).toBeTruthy();

      await seedActiveOwner(authStore, {
        email: 'owner@example.com',
        password: 'a-strong-passphrase',
      });

      const badPassword = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'owner@example.com', password: 'wrong-password-1' },
        { [API_CSRF_HEADER]: csrf.body.data.csrfToken },
        jar,
      );
      expect(badPassword.status).toBe(401);

      const csrf2 = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
      const login = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'owner@example.com', password: 'a-strong-passphrase' },
        { [API_CSRF_HEADER]: csrf2.body.data.csrfToken },
        jar,
      );
      expect(login.status).toBe(200);
      expect(login.body.data.session.user.email).toBe('owner@example.com');
      expect(login.body.data.session.activeContext.contextType).toBe('organization');
      expect(typeof login.body.data.csrfToken).toBe('string');

      const session = await fetchJson(baseUrl, 'GET', API_AUTH_SESSION_PATH, undefined, {}, jar);
      expect(session.status).toBe(200);
      expect(session.body.data.user.id).toBe(login.body.data.session.user.id);

      const logout = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGOUT_PATH,
        {},
        { [API_CSRF_HEADER]: login.body.data.csrfToken },
        jar,
      );
      expect(logout.status).toBe(200);

      const afterLogout = await fetchJson(
        baseUrl,
        'GET',
        API_AUTH_SESSION_PATH,
        undefined,
        {},
        jar,
      );
      expect(afterLogout.status).toBe(401);

      const audits = authStore.listAuditEventsForTest?.() ?? [];
      expect(audits.some((event) => event.action === 'auth.login')).toBe(true);
      expect(audits.some((event) => event.action === 'auth.logout')).toBe(true);
    } finally {
      await close(server);
    }
  });

  it('rejects inactive users and protects platform routes without auth', async () => {
    const { server, baseUrl, jar, authStore } = await boot();

    try {
      await seedActiveOwner(authStore, {
        email: 'pending@example.com',
        password: 'a-strong-passphrase',
        status: 'pending_activation',
      });
      const csrf = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
      const pendingLogin = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'pending@example.com', password: 'a-strong-passphrase' },
        { [API_CSRF_HEADER]: csrf.body.data.csrfToken },
        jar,
      );
      expect(pendingLogin.status).toBe(401);

      const unauthenticated = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_ORGANIZATIONS_PATH,
        undefined,
        {},
        jar,
      );
      expect(unauthenticated.status).toBe(401);
    } finally {
      await close(server);
    }
  });

  it('supports password reset with hashed single-use tokens and session invalidation', async () => {
    let current = new Date('2026-08-08T00:00:00.000Z');
    const { server, baseUrl, jar, authStore } = await boot({ now: () => current });

    try {
      await seedActiveOwner(authStore, {
        email: 'reset@example.com',
        password: 'original-passphrase',
      });

      const request = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_PASSWORD_RESET_REQUEST_PATH,
        { email: 'reset@example.com' },
        {},
        jar,
      );
      expect(request.status).toBe(200);
      expect(request.body.data.accepted).toBe(true);
      const resetToken = request.body.data.resetTokenForTest;
      expect(typeof resetToken).toBe('string');
      const stored = await authStore.findPasswordResetTokenByHash(hashToken(resetToken));
      expect(stored).not.toBeNull();
      expect(JSON.stringify(stored)).not.toContain(resetToken);

      const csrf = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
      const login = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'reset@example.com', password: 'original-passphrase' },
        { [API_CSRF_HEADER]: csrf.body.data.csrfToken },
        jar,
      );
      expect(login.status).toBe(200);

      current = new Date('2026-08-08T01:00:00.000Z');
      const csrfExpired = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
      const expired = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_PASSWORD_RESET_CONFIRM_PATH,
        { token: resetToken, password: 'replacement-passphrase' },
        { [API_CSRF_HEADER]: csrfExpired.body.data.csrfToken },
        jar,
      );
      expect(expired.status).toBe(403);

      current = new Date('2026-08-08T00:10:00.000Z');
      const request2 = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_PASSWORD_RESET_REQUEST_PATH,
        { email: 'reset@example.com' },
        {},
        jar,
      );
      const token2 = request2.body.data.resetTokenForTest;
      const csrfConfirm = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
      const confirm = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_PASSWORD_RESET_CONFIRM_PATH,
        { token: token2, password: 'replacement-passphrase' },
        { [API_CSRF_HEADER]: csrfConfirm.body.data.csrfToken },
        jar,
      );
      expect(confirm.status).toBe(200);

      const reuse = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_PASSWORD_RESET_CONFIRM_PATH,
        { token: token2, password: 'another-passphrase1' },
        { [API_CSRF_HEADER]: confirm.body.data.csrfToken },
        jar,
      );
      expect(reuse.status).toBe(409);

      const csrfLogin = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
      const oldPassword = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'reset@example.com', password: 'original-passphrase' },
        { [API_CSRF_HEADER]: csrfLogin.body.data.csrfToken },
        jar,
      );
      expect(oldPassword.status).toBe(401);

      const csrfLogin2 = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
      const newPassword = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'reset@example.com', password: 'replacement-passphrase' },
        { [API_CSRF_HEADER]: csrfLogin2.body.data.csrfToken },
        jar,
      );
      expect(newPassword.status).toBe(200);
    } finally {
      await close(server);
    }
  });

  it('keeps X-Platform-Actor unavailable in production', async () => {
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
    });
    const app = createApp({
      config: { ...config, nodeEnv: 'production' },
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
  const authStore = createBridgedAuthStore({ identityStore: onboarding.store });
  const auth = createAuthModule({
    config,
    persistence: 'memory',
    store: authStore,
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
    jar: createCookieJar(),
    authStore,
  };
}

async function seedActiveOwner(authStore, input) {
  const passwordHash = await hashPassword(input.password);
  const user = await authStore.insertUser(null, {
    email: input.email,
    emailNormalized: input.email,
    displayName: 'Owner',
    passwordHash,
    status: input.status ?? 'active',
    platformAccess: null,
    version: 1,
  });
  await authStore.insertMembership(null, {
    organizationId: 'org-1',
    userId: user['_id'],
    role: 'Owner',
    status: 'active',
    conditionalPermissionGrants: [],
    version: 1,
  });
  return user;
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
