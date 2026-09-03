import { describe, expect, it, vi } from 'vitest';
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
  API_PLATFORM_AUDIT_RETENTION_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
} from '@agrivio/api-contracts';
import { createRequirePermissionMiddleware } from '../identity/permission.middleware.js';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';
import { createAuditModule } from './audit.module.js';
import { createRequireCapabilityMiddleware } from '../capabilities/capability.middleware.js';
import { sanitizeAuditEvent } from '../../platform/audit/audit-writer.js';
import {
  collectSourceFiles,
  extractImportSpecifiers,
} from '../../platform/architecture/boundary-scan.js';

const { createApp } = require('../../app');
const { loadApiEnv } = require('../../platform/config/runtime-config');
const { createMockDatabaseLifecycle } = require('../../platform/database/mongo-connection');
const { hashPassword } = require('../identity/password.service');

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
    await audit.store.append(null, {
      _id: 'platform-event',
      scope: 'platform',
      organizationId: 'org-2',
      actorId: 'super-admin',
      action: 'organization.approved',
      resourceType: 'organization',
      resourceId: 'org-2',
      occurredAt: new Date('2026-08-03T00:00:00.000Z'),
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

    await expect(
      audit.auditService.getOrganizationEvent('org-1', 'other-org'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      audit.auditService.getOrganizationEvent('org-2', 'platform-event'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(audit.auditService.getOrganizationEvent('org-1', 'old')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      audit.auditService.queryOrganizationEvents('org-1', { organizationId: 'org-2' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const platform = await audit.auditService.queryPlatformEvents({ organizationId: 'org-2' });
    expect(platform.items.map((item) => item.id)).toEqual(['platform-event']);

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
      const orgAOwnerId = session.body.data.user.id;

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
      const orgBOwnerId = sessionB.body.data.user.id;

      await app.agrivio.audit.store.append(null, {
        organizationId: orgA,
        actorId: orgAOwnerId,
        action: 'sale.posted',
        resourceType: 'sale',
        resourceId: 'sale-a',
        reason: 'ok',
        occurredAt: now,
      });
      await app.agrivio.audit.store.append(null, {
        organizationId: orgB,
        actorId: orgBOwnerId,
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
        `${API_AUDIT_EVENTS_PATH}/filter-options?field=actorId&search=audit-a&limit=10`,
        undefined,
        {},
        jar,
      );
      expect(actorOptions.status).toBe(200);
      expect(actorOptions.body.data).toEqual({
        field: 'actorId',
        items: [
          {
            value: orgAOwnerId,
            label: 'Owner (audit-a@example.com)',
          },
        ],
      });
      expect(JSON.stringify(actorOptions.body.data)).not.toContain('audit-b@example.com');

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

      const orgASummary = await fetchJson(
        baseUrl,
        'GET',
        `${API_AUDIT_EVENTS_PATH}/summary`,
        undefined,
        {},
        jar,
      );
      expect(orgASummary.status).toBe(200);
      expect(typeof orgASummary.body.data.totalEvents).toBe('number');
      expect(typeof orgASummary.body.data.eventsToday).toBe('number');
      expect(typeof orgASummary.body.data.uniqueActors).toBe('number');
      expect(typeof orgASummary.body.data.resourceTypes).toBe('number');
      expect(orgASummary.body.data.totalEvents).toBeGreaterThanOrEqual(1);

      const orgBSummaryBeforePlatformEvent = await fetchJson(
        baseUrl,
        'GET',
        `${API_AUDIT_EVENTS_PATH}/summary`,
        undefined,
        {},
        sessionBJar,
      );

      const cross = await fetchJson(
        baseUrl,
        'GET',
        `${API_AUDIT_EVENTS_PATH}?organizationId=${orgB}`,
        undefined,
        {},
        jar,
      );
      expect(cross.status).toBe(403);

      await app.agrivio.audit.store.append(null, {
        scope: 'platform',
        organizationId: orgB,
        actorId: 'super-admin',
        action: 'organization.suspended',
        resourceType: 'organization',
        resourceId: orgB,
        occurredAt: now,
      });

      const tenantWithPlatformHeader = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_AUDIT_EVENTS_PATH,
        undefined,
        { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(tenantWithPlatformHeader.status).toBe(403);

      const superAdminJar = createCookieJar();
      await createSuperAdmin(baseUrl, app, superAdminJar);
      const platformQuery = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_AUDIT_EVENTS_PATH,
        undefined,
        {},
        superAdminJar,
      );
      expect(platformQuery.status).toBe(200);
      expect(platformQuery.body.data.some((item) => item.action === 'organization.suspended')).toBe(
        true,
      );
      expect(platformQuery.body.data.some((item) => item.resourceId === 'sale-b')).toBe(false);

      const retention = await fetchJson(
        baseUrl,
        'GET',
        `${API_PLATFORM_AUDIT_RETENTION_PATH}?scope=tenant&organizationId=${orgB}`,
        undefined,
        {},
        superAdminJar,
      );
      expect(retention.status).toBe(200);
      expect(retention.body.data).toMatchObject({
        scope: 'tenant',
        organizationId: orgB,
        configuredRetentionDays: 90,
        retentionSource: 'subscription',
      });

      const purged = await fetchJson(
        baseUrl,
        'POST',
        `${API_PLATFORM_AUDIT_RETENTION_PATH}/purge-expired`,
        {
          scope: 'tenant',
          organizationId: orgB,
          reason: 'Scheduled retention cleanup',
          confirmed: true,
        },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, superAdminJar) },
        superAdminJar,
      );
      expect(purged.status).toBe(200);
      expect(purged.body.data).toMatchObject({ scope: 'tenant', organizationId: orgB });

      const orgBAfterPlatformEvent = await fetchJson(
        baseUrl,
        'GET',
        API_AUDIT_EVENTS_PATH,
        undefined,
        {},
        sessionBJar,
      );
      expect(
        orgBAfterPlatformEvent.body.data.some(
          (item) => item.action === 'organization.suspended' && item.actorId === 'super-admin',
        ),
      ).toBe(false);
      const orgBSummaryAfterPlatformEvent = await fetchJson(
        baseUrl,
        'GET',
        `${API_AUDIT_EVENTS_PATH}/summary`,
        undefined,
        {},
        sessionBJar,
      );
      expect(orgBSummaryAfterPlatformEvent.body.data).toEqual(
        orgBSummaryBeforePlatformEvent.body.data,
      );
    } finally {
      await close(server);
    }
  }, 120000);

  it('computes authoritative organization summary obeying history window, timezone boundary, and tenant isolation', async () => {
    // Current test clock: 2026-08-14T10:00:00.000Z
    // In Asia/Karachi (UTC+5), start of today is 2026-08-13T19:00:00.000Z
    // In America/New_York (EDT, UTC-4), start of today is 2026-08-14T04:00:00.000Z
    let orgTz = 'Asia/Karachi';
    const audit = createAuditModule({
      now: () => now,
      resolvePlanEntitlements: async () => ({ auditHistory: '30d' }),
      resolveOrganizationTimezone: async () => orgTz,
    });

    // 1. Event today in both Karachi and NY (2026-08-14T06:00:00Z)
    await audit.store.append(null, {
      _id: 'ev-today-both',
      organizationId: 'org-kpi',
      actorId: 'actor-1',
      action: 'sale.posted',
      resourceType: 'sale',
      resourceId: 's-1',
      occurredAt: new Date('2026-08-14T06:00:00.000Z'),
    });

    // 2. Event that is today in Karachi (2026-08-14 01:00 PKT) but yesterday in NY (2026-08-13 16:00 EDT)
    await audit.store.append(null, {
      _id: 'ev-tz-boundary',
      organizationId: 'org-kpi',
      actorId: 'actor-2',
      action: 'purchase.posted',
      resourceType: 'purchase',
      resourceId: 'p-1',
      occurredAt: new Date('2026-08-13T20:00:00.000Z'),
    });

    // 3. Event within 30d window but yesterday in both timezones (2026-08-10T12:00:00Z)
    await audit.store.append(null, {
      _id: 'ev-past-in-window',
      organizationId: 'org-kpi',
      actorId: 'actor-1',
      action: 'inventory.adjustment',
      resourceType: 'inventory',
      resourceId: 'inv-1',
      occurredAt: new Date('2026-08-10T12:00:00.000Z'),
    });

    // 4. Old event outside 30d window (2026-06-01) - MUST BE EXCLUDED from KPIs
    await audit.store.append(null, {
      _id: 'ev-outside-window',
      organizationId: 'org-kpi',
      actorId: 'actor-3',
      action: 'returns.posted',
      resourceType: 'return',
      resourceId: 'ret-1',
      occurredAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    // 5. Cross-organization event - MUST BE EXCLUDED from org-kpi KPIs
    await audit.store.append(null, {
      _id: 'ev-other-org',
      organizationId: 'other-org',
      actorId: 'actor-99',
      action: 'expenses.posted',
      resourceType: 'expense',
      resourceId: 'exp-1',
      occurredAt: new Date('2026-08-14T08:00:00.000Z'),
    });

    // Test in Asia/Karachi timezone
    orgTz = 'Asia/Karachi';
    const summaryKarachi = await audit.auditService.getOrganizationSummary('org-kpi');
    // Accessible events within 30d: ev-today-both, ev-tz-boundary, ev-past-in-window = 3 total
    expect(summaryKarachi.totalEvents).toBe(3);
    // Today in Karachi: ev-today-both (Aug 14 11:00) + ev-tz-boundary (Aug 14 01:00) = 2
    expect(summaryKarachi.eventsToday).toBe(2);
    // Unique actors in window: actor-1, actor-2 = 2
    expect(summaryKarachi.uniqueActors).toBe(2);
    // Resource types in window: sale, purchase, inventory = 3
    expect(summaryKarachi.resourceTypes).toBe(3);

    // Test in America/New_York timezone
    orgTz = 'America/New_York';
    const summaryNY = await audit.auditService.getOrganizationSummary('org-kpi');
    expect(summaryNY.totalEvents).toBe(3);
    // Today in NY: only ev-today-both (Aug 14 02:00 EDT); ev-tz-boundary is Aug 13 16:00 EDT (yesterday)
    expect(summaryNY.eventsToday).toBe(1);
    expect(summaryNY.uniqueActors).toBe(2);
    expect(summaryNY.resourceTypes).toBe(3);
  });

  it('assigns explicit tenant and platform scopes when audit events are written', () => {
    const tenantEvent = sanitizeAuditEvent({
      organizationId: 'org-1',
      actorId: 'owner-1',
      action: 'sale.posted',
      resourceType: 'sale',
    });
    const platformEvent = sanitizeAuditEvent({
      actorId: 'super-admin',
      action: 'auth.login',
      resourceType: 'auth_session',
    });

    expect(tenantEvent.scope).toBe('tenant');
    expect(platformEvent.scope).toBe('platform');
  });

  it('returns organization-scoped employee actor options and System with actor IDs as values', async () => {
    const resolveActorOptions = vi.fn(async (organizationId, options) => {
      expect(organizationId).toBe('org-1');
      expect(options).toEqual({ limit: 10 });
      return [{ value: 'user-1', label: 'Owner One (owner@example.com)' }];
    });
    const audit = createAuditModule({
      now: () => now,
      resolvePlanEntitlements: async () => ({ auditHistory: '30d' }),
      resolveActorOptions,
    });
    await audit.store.append(null, {
      organizationId: 'org-1',
      actorId: 'system',
      action: 'subscription.status_transition',
      resourceType: 'subscription',
      occurredAt: now,
    });
    await audit.store.append(null, {
      organizationId: 'org-2',
      actorId: 'system',
      action: 'subscription.status_transition',
      resourceType: 'subscription',
      occurredAt: now,
    });

    const options = await audit.auditService.queryOrganizationFilterOptions('org-1', {
      field: 'actorId',
      limit: 10,
    });

    expect(options).toEqual({
      field: 'actorId',
      items: [
        { value: 'system', label: 'System', system: true },
        { value: 'user-1', label: 'Owner One (owner@example.com)' },
      ],
    });
  });

  it('does not let an enabled Audit capability grant a missing audit.view permission', async () => {
    const request = {
      auth: { userId: 'c1' },
      authContext: {
        userId: 'c1',
        organizationId: 'org-1',
        contextType: 'organization',
        permissions: permissionsForMembershipRole('Cashier'),
      },
    };
    const capabilityService = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
    const capabilityMiddleware = createRequireCapabilityMiddleware(
      capabilityService,
      'audit',
      'enabled',
    );
    await new Promise((resolve) => capabilityMiddleware(request, {}, resolve));

    let permissionError;
    createRequirePermissionMiddleware('audit.view')(request, {}, (error) => {
      permissionError = error;
    });

    expect(capabilityService.assertAllowed).toHaveBeenCalled();
    expect(permissionError?.code).toBe('PERMISSION_DENIED');
  });

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

async function createSuperAdmin(baseUrl, app, jar) {
  const password = 'super-secure-passphrase';
  await app.agrivio.auth.store.insertUser(null, {
    email: 'platform-audit@example.com',
    emailNormalized: 'platform-audit@example.com',
    displayName: 'Platform Audit Admin',
    passwordHash: await hashPassword(password),
    status: 'active',
    platformAccess: 'super_admin',
  });
  await login(baseUrl, jar, 'platform-audit@example.com', password);
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
