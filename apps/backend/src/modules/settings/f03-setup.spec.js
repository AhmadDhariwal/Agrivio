import { describe, expect, it } from 'vitest';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_BRANCHES_PATH,
  API_CSRF_HEADER,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_SETTINGS_PATH,
  API_USERS_PATH,
  API_WAREHOUSES_PATH,
  ApiTransportErrorCode,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

describe('F03 P1 settings/branches/warehouses/employees', () => {
  it('enforces tenant isolation, permissions, version conflict, and Owner invariants', async () => {
    const { server, baseUrl, jar } = await boot();

    try {
      await seedPlan(baseUrl, jar);

      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F03 Org A',
        ownerEmail: 'f03-owner-a@example.com',
        password: 'a-strong-passphrase',
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F03 Org B',
        ownerEmail: 'f03-owner-b@example.com',
        password: 'a-strong-passphrase',
      });

      await login(baseUrl, jar, 'f03-owner-a@example.com', 'a-strong-passphrase');

      const settings = await fetchJson(baseUrl, 'GET', API_SETTINGS_PATH, undefined, {}, jar);
      expect(settings.status).toBe(200);
      expect(settings.body.data.organizationId).toBe(orgA.organizationId);

      const updated = await fetchJson(
        baseUrl,
        'PATCH',
        API_SETTINGS_PATH,
        { expectedVersion: 1, tradingName: 'Trading A', contactPhone: '03001112222' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(updated.status).toBe(200);
      expect(updated.body.data.tradingName).toBe('Trading A');
      expect(updated.body.data.version).toBe(2);

      const stale = await fetchJson(
        baseUrl,
        'PATCH',
        API_SETTINGS_PATH,
        { expectedVersion: 1, tradingName: 'Stale' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe(ApiTransportErrorCode.VersionConflict);

      const branch = await fetchJson(
        baseUrl,
        'POST',
        API_BRANCHES_PATH,
        { name: 'Main', invoicePrefix: 'MAIN' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(branch.status).toBe(201);

      const warehouse = await fetchJson(
        baseUrl,
        'POST',
        API_WAREHOUSES_PATH,
        { name: 'Central WH' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(warehouse.status).toBe(201);

      const employee = await fetchJson(
        baseUrl,
        'POST',
        API_USERS_PATH,
        {
          email: 'f03-cashier@example.com',
          displayName: 'Cashier',
          role: 'Cashier',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(employee.status).toBe(201);
      expect(employee.body.data.activationToken).toBeTruthy();

      const promoteSa = await fetchJson(
        baseUrl,
        'POST',
        API_USERS_PATH,
        {
          email: 'f03-sa@example.com',
          displayName: 'Nope',
          role: 'Super Admin',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(promoteSa.status).toBe(403);

      const assign = await fetchJson(
        baseUrl,
        'PUT',
        `${API_USERS_PATH}/${employee.body.data.id}/access-assignments`,
        {
          branchIds: [branch.body.data.id],
          warehouseIds: [warehouse.body.data.id],
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(assign.status).toBe(200);

      await login(baseUrl, jar, 'f03-owner-b@example.com', 'a-strong-passphrase');
      const crossBranch = await fetchJson(
        baseUrl,
        'GET',
        `${API_BRANCHES_PATH}/${branch.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossBranch.status).toBe(404);

      const crossWarehouse = await fetchJson(
        baseUrl,
        'GET',
        `${API_WAREHOUSES_PATH}/${warehouse.body.data.id}`,
        undefined,
        {},
        jar,
      );
      expect(crossWarehouse.status).toBe(404);

      const crossSettingsWrite = await fetchJson(
        baseUrl,
        'PATCH',
        API_SETTINGS_PATH,
        { expectedVersion: 1, tradingName: 'Org B' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(crossSettingsWrite.status).toBe(200);
      expect(crossSettingsWrite.body.data.organizationId).toBe(orgB.organizationId);

      const branchB = await fetchJson(
        baseUrl,
        'POST',
        API_BRANCHES_PATH,
        { name: 'B Main', invoicePrefix: 'BMAIN' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(branchB.status).toBe(201);

      await login(baseUrl, jar, 'f03-owner-a@example.com', 'a-strong-passphrase');
      const crossAssign = await fetchJson(
        baseUrl,
        'PUT',
        `${API_USERS_PATH}/${employee.body.data.id}/access-assignments`,
        { branchIds: [branchB.body.data.id], warehouseIds: [] },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(crossAssign.status).toBe(400);

      const deactivate = await fetchJson(
        baseUrl,
        'POST',
        `${API_USERS_PATH}/${employee.body.data.id}/deactivate`,
        {},
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(deactivate.status).toBe(200);
      expect(deactivate.body.data.status).toBe('deactivated');

      // Activate employee then confirm unauthorized role cannot manage users.
      await login(baseUrl, jar, 'f03-owner-a@example.com', 'a-strong-passphrase');
      const manager = await fetchJson(
        baseUrl,
        'POST',
        API_USERS_PATH,
        {
          email: 'f03-manager@example.com',
          displayName: 'Manager',
          role: 'Manager',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(manager.status).toBe(201);
      const activatedManager = await fetchJson(
        baseUrl,
        'POST',
        '/api/v1/auth/activate',
        {
          token: manager.body.data.activationToken,
          password: 'a-strong-passphrase',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(activatedManager.status).toBe(200);

      await fetchJson(baseUrl, 'POST', API_AUTH_LOGOUT_PATH, {}, {
        [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      }, jar);
      await login(baseUrl, jar, 'f03-manager@example.com', 'a-strong-passphrase');
      const managerCreate = await fetchJson(
        baseUrl,
        'POST',
        API_USERS_PATH,
        {
          email: 'f03-blocked@example.com',
          displayName: 'Blocked',
          role: 'Cashier',
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(managerCreate.status).toBe(403);

      // Unauthenticated / platform-actor alone cannot call organization settings.
      await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGOUT_PATH,
        {},
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      const platformSettings = await fetchJson(
        baseUrl,
        'GET',
        API_SETTINGS_PATH,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect([401, 403]).toContain(platformSettings.status);
    } finally {
      await close(server);
    }
  });
});

async function boot() {
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
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    jar: createCookieJar(),
    authStore: app.agrivio.auth.store,
  };
}

async function seedPlan(baseUrl, jar) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
    {
      planCode: 'Starter',
      activate: true,
      monthlyPriceMinorUnits: 1000,
    },
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
    },
    jar,
  );
  expect([200, 201]).toContain(response.status);
}

async function createApprovedOwner(baseUrl, jar, input) {
  const requested = await fetchJson(
    baseUrl,
    'POST',
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: input.organizationName,
      ownerEmail: input.ownerEmail,
      ownerDisplayName: 'Owner',
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(requested.status).toBe(201);

  const approved = await fetchJson(
    baseUrl,
    'POST',
    `${API_PLATFORM_ORGANIZATIONS_PATH}/${requested.body.data.organizationId}/approve`,
    {},
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
    },
    jar,
  );
  expect(approved.status).toBe(200);

  const activated = await fetchJson(
    baseUrl,
    'POST',
    '/api/v1/auth/activate',
    {
      token: approved.body.data.activationToken,
      password: input.password,
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(activated.status).toBe(200);

  return {
    organizationId: requested.body.data.organizationId,
    membershipId: activated.body.data.session.activeContext.membershipId,
  };
}

async function login(baseUrl, jar, email, password) {
  const csrf = await issueCsrf(baseUrl, jar);
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_AUTH_LOGIN_PATH,
    { email, password },
    { [API_CSRF_HEADER]: csrf },
    jar,
  );
  expect(response.status).toBe(200);
  return response.body.data.session;
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
