import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import {
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_CSRF_HEADER,
  API_DASHBOARD_PATH,
  API_IMPORTS_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_ORGANIZATION_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PLATFORM_SUBSCRIPTIONS_PATH,
  API_REPORTS_PATH,
} from '@agrivio/api-contracts';
import {
  FROZEN_SUSPENDED_POLICY_MATRIX,
  expectedOutcome,
} from '../subscriptions/frozen-suspended-policy.js';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

const entitled = { reportsExports: true, imports: true, auditHistory: '90d' };

describe('F08 P4 suspended-policy matrix', () => {
  it('encodes Frozen allow/deny without treating suspended as block-everything', () => {
    const ids = FROZEN_SUSPENDED_POLICY_MATRIX.map((row) => row.id);
    expect(ids).toEqual([
      'report-view',
      'report-export',
      'dashboard',
      'import-preview',
      'import-execute',
      'audit-view',
    ]);

    const suspendedEntitled = { status: 'suspended', entitlements: entitled };
    expect(expectedOutcome(row('report-view'), suspendedEntitled)).toBe('allow');
    expect(expectedOutcome(row('report-export'), suspendedEntitled)).toBe('allow');
    expect(expectedOutcome(row('dashboard'), suspendedEntitled)).toBe('deny');
    expect(expectedOutcome(row('import-preview'), suspendedEntitled)).toBe('deny');
    expect(expectedOutcome(row('import-execute'), suspendedEntitled)).toBe('deny');
    expect(expectedOutcome(row('audit-view'), suspendedEntitled)).toBe('allow');

    const suspendedUnentitled = {
      status: 'suspended',
      entitlements: { reportsExports: false, imports: true, auditHistory: null },
    };
    expect(expectedOutcome(row('report-export'), suspendedUnentitled)).toBe('deny');
    expect(expectedOutcome(row('audit-view'), suspendedUnentitled)).toBe('deny');
    expect(expectedOutcome(row('report-view'), suspendedUnentitled)).toBe('allow');

    const active = { status: 'active', entitlements: entitled };
    expect(expectedOutcome(row('import-preview'), active)).toBe('allow');
    expect(expectedOutcome(row('dashboard'), active)).toBe('allow');
  });

  it('enforces the matrix on HTTP, including alternate dashboard bypass, reactivation, and data retention', async () => {
    const { server, baseUrl, jar } = await boot();
    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'Suspended Policy Org',
        ownerEmail: 'suspend-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'suspend-owner@example.com', 'a-strong-passphrase');

      const org = await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar);
      expect(org.status).toBe(200);
      const organizationName = org.body.data.name;

      const listed = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_SUBSCRIPTIONS_PATH,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      const subscription = listed.body.data.items[0];
      const suspended = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_SUBSCRIPTIONS_PATH}/${subscription.id}/suspend`,
        { expectedVersion: subscription.version, reason: 'Policy matrix proof' },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(suspended.status).toBe(200);

      const reportView = await fetchJson(baseUrl, 'GET', `${API_REPORTS_PATH}/sales`, undefined, {}, jar);
      expect(reportView.status).toBe(200);

      const reportExport = await fetchJson(
        baseUrl,
        'POST',
        `${API_REPORTS_PATH}/sales/export`,
        { format: 'csv' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(reportExport.status).toBe(200);

      const dashboard = await fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar);
      expect(dashboard.status).toBe(403);

      const importPreview = await fetchJson(
        baseUrl,
        'POST',
        API_IMPORTS_PATH,
        { importType: 'product_categories' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(importPreview.status).toBe(403);

      const importTemplates = await fetchJson(
        baseUrl,
        'GET',
        `${API_IMPORTS_PATH}/templates`,
        undefined,
        {},
        jar,
      );
      expect(importTemplates.status).toBe(403);

      const orgStillThere = await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar);
      expect(orgStillThere.status).toBe(200);
      expect(orgStillThere.body.data.name).toBe(organizationName);

      const reactivated = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_SUBSCRIPTIONS_PATH}/${subscription.id}/reactivate`,
        { expectedVersion: suspended.body.data.version, reason: 'Restore entitled access' },
        {
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          [API_PLATFORM_ACTOR_HEADER]: 'super-admin',
        },
        jar,
      );
      expect(reactivated.status).toBe(200);

      const importAfter = await fetchJson(
        baseUrl,
        'GET',
        `${API_IMPORTS_PATH}/templates`,
        undefined,
        {},
        jar,
      );
      expect(importAfter.status).toBe(200);

      const dashboardAfter = await fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar);
      expect(dashboardAfter.status).toBe(200);
    } finally {
      await close(server);
    }
  }, 120000);
});

function row(id) {
  return FROZEN_SUSPENDED_POLICY_MATRIX.find((item) => item.id === id);
}

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
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, jar: createCookieJar() };
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
      entitlements: entitled,
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
    { token: approved.body.data.activationToken, password: input.password },
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
