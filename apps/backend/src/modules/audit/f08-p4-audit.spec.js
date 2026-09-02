import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_AUDIT_EVENTS_PATH,
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_CSRF_HEADER,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_AUDIT_EVENTS_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
} from '@agrivio/api-contracts';
import { createRequirePermissionMiddleware } from '../identity/permission.middleware.js';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';
import { createAuditModule } from './audit.module.js';
import {
  collectSourceFiles,
  extractImportSpecifiers,
} from '../../platform/architecture/boundary-scan.js';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');

const testDir = fileURLToPath(new URL('.', import.meta.url));
const backendRoot = join(testDir, '../..');
const now = new Date('2026-08-14T10:00:00.000Z');

describe('F08 P4 audit inquiry', () => {
  it('enforces audit.view for Owner and denies Cashier', () => {
    const middleware = createRequirePermissionMiddleware('audit.view');
    let ownerError;
    middleware(
      {
        auth: { userId: 'o1' },
        authContext: {
          userId: 'o1',
          organizationId: 'org-1',
          contextType: 'organization',
          permissions: permissionsForMembershipRole('Owner'),
        },
      },
      {},
      (err) => {
        ownerError = err;
      },
    );
    expect(ownerError).toBeUndefined();

    let cashierError = null;
    middleware(
      {
        auth: { userId: 'c1' },
        authContext: {
          userId: 'c1',
          organizationId: 'org-1',
          contextType: 'organization',
          permissions: permissionsForMembershipRole('Cashier'),
        },
      },
      {},
      (err) => {
        cashierError = err;
      },
    );
    expect(cashierError?.code).toBe('PERMISSION_DENIED');
  });

  it('filters by actor/action/date, isolates tenants, and enforces audit-history depth', async () => {
    const audit = createAuditModule({
      now: () => now,
      resolvePlanEntitlements: async () => ({ auditHistory: '30d' }),
    });
    await audit.store.append(null, {
      _id: 'in-window',
      organizationId: 'org-1',
      actorId: 'actor-a',
      action: 'sale.posted',
      resourceType: 'sale',
      resourceId: 'sale-1',
      reason: 'posted',
      occurredAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await audit.store.append(null, {
      _id: 'old',
      organizationId: 'org-1',
      actorId: 'actor-a',
      action: 'sale.posted',
      resourceType: 'sale',
      resourceId: 'sale-old',
      occurredAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    await audit.store.append(null, {
      _id: 'other-org',
      organizationId: 'org-2',
      actorId: 'actor-a',
      action: 'sale.posted',
      resourceType: 'sale',
      resourceId: 'sale-x',
      occurredAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await audit.store.append(null, {
      _id: 'other-action',
      organizationId: 'org-1',
      actorId: 'actor-b',
      action: 'purchase.posted',
      resourceType: 'purchase',
      resourceId: 'p-1',
      occurredAt: new Date('2026-08-02T00:00:00.000Z'),
    });

    const listed = await audit.auditService.queryOrganizationEvents('org-1', {
      actorId: 'actor-a',
      action: 'sale.posted',
    });
    expect(listed.items.map((item) => item.id)).toEqual(['in-window']);

    const actorOptions = await audit.auditService.queryOrganizationFilterOptions('org-1', {
      field: 'actorId',
      search: 'actor',
      limit: 10,
    });
    expect(actorOptions).toEqual({ field: 'actorId', items: ['actor-a', 'actor-b'] });
    const resourceOptions = await audit.auditService.queryOrganizationFilterOptions('org-1', {
      field: 'resourceId',
      search: 'sale',
      limit: 10,
    });
    expect(resourceOptions.items).toEqual(['sale-1']);
    await expect(
      audit.auditService.queryOrganizationFilterOptions('org-1', { field: 'reason' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(audit.auditService.getOrganizationEvent('org-1', 'other-org')).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    );
    await expect(audit.auditService.getOrganizationEvent('org-1', 'old')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      audit.auditService.queryOrganizationEvents('org-1', { organizationId: 'org-2' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const platform = await audit.auditService.queryPlatformEvents({ organizationId: 'org-2' });
    expect(platform.items.map((item) => item.id)).toEqual(['other-org']);

    await expect(
      audit.auditService.queryOrganizationEvents('org-1', {
        from: '2026-08-20T00:00:00.000Z',
        to: '2026-08-19T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('serves authorized org inquiry over HTTP and hides cross-org events from platform-vs-org scopes', async () => {
    const { server, baseUrl, jar, app } = await boot();
    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'Audit Org A',
        ownerEmail: 'audit-a@example.com',
        password: 'a-strong-passphrase',
      });
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'Audit Org B',
        ownerEmail: 'audit-b@example.com',
        password: 'a-strong-passphrase',
      });
      await login(baseUrl, jar, 'audit-a@example.com', 'a-strong-passphrase');
      const session = await fetchJson(baseUrl, 'GET', '/api/v1/auth/session', undefined, {}, jar);
      const orgA = session.body.data.activeContext.organizationId;

      const sessionBJar = createCookieJar();
      await login(baseUrl, sessionBJar, 'audit-b@example.com', 'a-strong-passphrase');
      const sessionB = await fetchJson(
        baseUrl,
        'GET',
        '/api/v1/auth/session',
        undefined,
        {},
        sessionBJar,
      );
      const orgB = sessionB.body.data.activeContext.organizationId;

      await app.agrivio.audit.store.append(null, {
        organizationId: orgA,
        actorId: 'owner-a',
        action: 'sale.posted',
        resourceType: 'sale',
        resourceId: 'sale-a',
        reason: 'ok',
        occurredAt: now,
      });
      await app.agrivio.audit.store.append(null, {
        organizationId: orgB,
        actorId: 'owner-b',
        action: 'sale.posted',
        resourceType: 'sale',
        resourceId: 'sale-b',
        occurredAt: now,
      });

      const orgQuery = await fetchJson(baseUrl, 'GET', API_AUDIT_EVENTS_PATH, undefined, {}, jar);
      expect(orgQuery.status).toBe(200);
      expect(orgQuery.body.data.every((item) => item.organizationId === orgA)).toBe(true);
      expect(orgQuery.body.data.some((item) => item.resourceId === 'sale-b')).toBe(false);

      const actorOptions = await fetchJson(
        baseUrl,
        'GET',
        `${API_AUDIT_EVENTS_PATH}/filter-options?field=actorId&search=owner&limit=10`,
        undefined,
        {},
        jar,
      );
      expect(actorOptions.status).toBe(200);
      expect(actorOptions.body.data).toEqual({ field: 'actorId', items: ['owner-a'] });

      const orgBOptions = await fetchJson(
        baseUrl,
        'GET',
        `${API_AUDIT_EVENTS_PATH}/filter-options?field=resourceId&limit=10`,
        undefined,
        {},
        sessionBJar,
      );
      expect(orgBOptions.status).toBe(200);
      expect(orgBOptions.body.data.items).toContain('sale-b');
      expect(orgBOptions.body.data.items).not.toContain('sale-a');

      const cross = await fetchJson(
        baseUrl,
        'GET',
        `${API_AUDIT_EVENTS_PATH}?organizationId=${orgB}`,
        undefined,
        {},
        jar,
      );
      expect(cross.status).toBe(403);

      const platformQuery = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_AUDIT_EVENTS_PATH,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(platformQuery.status).toBe(200);
      expect(platformQuery.body.data.some((item) => item.resourceId === 'sale-b')).toBe(true);
    } finally {
      await close(server);
    }
  }, 120000);

  it('keeps Audit free of business-module persistence imports', () => {
    const violations = [];
    for (const filePath of collectSourceFiles(join(backendRoot, 'modules/audit'))) {
      const normalized = filePath.replaceAll('\\', '/');
      for (const specifier of extractImportSpecifiers(filePath)) {
        if (specifier.includes('/sales/') || specifier.includes('/purchases/')) {
          violations.push(`${normalized} → ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

async function boot() {
  const config = loadApiEnv({ NODE_ENV: 'test' });
  const app = createApp({
    config,
    database: createMockDatabaseLifecycle({ ready: true }),
    now: () => now,
  });
  const server = createServer(app);
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP port');
  }
  return {
    app,
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
      entitlements: { auditHistory: '90d', reportsExports: true, imports: true },
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
