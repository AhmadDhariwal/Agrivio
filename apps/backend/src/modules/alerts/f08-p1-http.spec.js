import { describe, expect, it } from 'vitest';
import {
  API_ALERTS_PATH,
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_CSRF_HEADER,
  API_DASHBOARD_PATH,
  API_NOTIFICATIONS_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
} from '@agrivio/api-contracts';
import { createServer } from 'node:http';
import { createRequirePermissionMiddleware } from '../identity/permission.middleware.js';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

describe('F08 P1 permission middleware and HTTP surface', () => {
  it('denies alerts.view and dashboard.view when permission is missing', () => {
    const alertsMw = createRequirePermissionMiddleware('alerts.view');
    const dashboardMw = createRequirePermissionMiddleware('dashboard.view');
    const cashier = {
      auth: { userId: 'c1' },
      authContext: {
        userId: 'c1',
        organizationId: 'org-1',
        contextType: 'organization',
        permissions: permissionsForMembershipRole('Cashier').filter(
          (permission) => permission !== 'alerts.view' && permission !== 'dashboard.view',
        ),
      },
    };

    let alertsError = null;
    let dashboardError = null;
    alertsMw(cashier, {}, (error) => {
      alertsError = error;
    });
    dashboardMw(cashier, {}, (error) => {
      dashboardError = error;
    });
    expect(alertsError?.code).toBe('FORBIDDEN');
    expect(dashboardError?.code).toBe('FORBIDDEN');

    const owner = {
      auth: { userId: 'o1' },
      authContext: {
        userId: 'o1',
        organizationId: 'org-1',
        contextType: 'organization',
        permissions: permissionsForMembershipRole('Owner'),
      },
    };
    let ownerAlerts = 'pending';
    alertsMw(owner, {}, (error) => {
      ownerAlerts = error === undefined ? 'ok' : error;
    });
    expect(ownerAlerts).toBe('ok');
  });

  it('serves alerts and dashboard for an operational Owner and rejects unauthenticated calls', async () => {
    const { server, baseUrl, jar } = await boot();
    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F08P1 Org',
        ownerEmail: 'f08p1-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'f08p1-owner@example.com', 'a-strong-passphrase');

      const alertsOk = await fetchJson(baseUrl, 'GET', API_ALERTS_PATH, undefined, {}, jar);
      expect(alertsOk.status).toBe(200);
      expect(alertsOk.body.data.summaries).toBeTruthy();

      const feedOk = await fetchJson(
        baseUrl,
        'GET',
        `${API_NOTIFICATIONS_PATH}/feed?limit=3`,
        undefined,
        {},
        jar,
      );
      expect(feedOk.status).toBe(200);
      expect(feedOk.body.data.items).toEqual([]);
      expect(feedOk.body.data.unreadCount).toBe(0);

      const markAllRead = await fetchJson(
        baseUrl,
        'POST',
        `${API_NOTIFICATIONS_PATH}/mark-all-read`,
        {},
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(markAllRead.status).toBe(200);
      expect(markAllRead.body.data).toEqual({ success: true, unreadCount: 0 });

      const dashboardOk = await fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar);
      expect(dashboardOk.status).toBe(200);
      expect(dashboardOk.body.data).toHaveProperty('todaysSales');
      expect(dashboardOk.body.data).toHaveProperty('grossProfit');
      expect(dashboardOk.body.data.entitlements).toHaveProperty('reportsExportsAllowed');
      expect(dashboardOk.body.data).not.toHaveProperty('cachedBalance');

      const emptyJar = createCookieJar();
      const denied = await fetchJson(baseUrl, 'GET', API_ALERTS_PATH, undefined, {}, emptyJar);
      expect(denied.status).toBe(401);
      const deniedDash = await fetchJson(
        baseUrl,
        'GET',
        API_DASHBOARD_PATH,
        undefined,
        {},
        emptyJar,
      );
      expect(deniedDash.status).toBe(401);
    } finally {
      await close(server);
    }
  }, 120000);
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
}

async function login(baseUrl, jar, email, password) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_AUTH_LOGIN_PATH,
    { email, password },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  expect(response.status).toBe(200);
}

async function issueCsrf(baseUrl, jar) {
  const response = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  expect(response.status).toBe(200);
  return response.body.data.csrfToken;
}

function createCookieJar() {
  const cookies = new Map();
  return {
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

async function fetchJson(baseUrl, method, path, body, headers, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === null || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(jar?.header() ? { Cookie: jar.header() } : {}),
      ...headers,
    },
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.absorb(response.headers);
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}
