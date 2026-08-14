import { describe, expect, it } from 'vitest';
import {
  API_ACCOUNTS_PATH,
  API_ALERTS_PATH,
  API_AUDIT_EVENTS_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_PASSWORD_RESET_REQUEST_PATH,
  API_AUTH_SESSION_CONTEXT_PATH,
  API_AUTH_SESSION_PATH,
  API_BRANCHES_PATH,
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_DASHBOARD_PATH,
  API_EXPENSE_CATEGORIES_PATH,
  API_EXPENSES_PATH,
  API_IMPORTS_PATH,
  API_INVENTORY_BATCHES_PATH,
  API_ORGANIZATION_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_PLATFORM_AUDIT_EVENTS_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTIONS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_PURCHASES_PATH,
  API_REPORTS_PATH,
  API_RETURNS_PATH,
  API_SALES_PATH,
  API_SETTINGS_PATH,
  API_SUPPLIERS_PATH,
  API_USERS_PATH,
  API_WAREHOUSES_PATH,
} from '@agrivio/api-contracts';
import {
  createAuthRateLimiter,
  resolveAuthRateLimiterOptions,
} from '../../src/modules/identity/auth.rate-limit.js';
import { hashToken } from '../../src/modules/identity/crypto-tokens.js';
import { createPlatformActorMiddleware } from '../../src/modules/platform/platform-actor.middleware.js';
import { SYSTEM_SCOPE, createSystemScope } from '../../src/platform/tenancy/tenant-scope.js';
import {
  bootF09App,
  closeServer,
  createApprovedOwner,
  fetchJson,
  issueCsrf,
  login,
  logout,
  seedOrgMember,
  seedPlan,
  seedSuperAdmin,
  API_SESSION_COOKIE_NAME,
} from './f09-http-harness.js';

const PASSWORD = 'a-strong-passphrase';
const ORG_B_NAME = 'F09 Attack Org B Distinct';
const CUSTOMER_B_NAME = 'Farmer B Secret Tenant';
const SUPPLIER_B_NAME = 'Supplier B Secret Tenant';

const SECRET_LEAK_NEEDLES = [
  'passwordHash',
  'csrfHash',
  'tokenHash',
  'SESSION_SECRET',
  'resetTokenForTest',
  'stack',
  ORG_B_NAME,
  CUSTOMER_B_NAME,
  SUPPLIER_B_NAME,
];

function serialized(response) {
  return JSON.stringify(response.body ?? {});
}

function assertOpaqueDenial(response) {
  expect([403, 404]).toContain(response.status);
  const text = serialized(response);
  for (const needle of SECRET_LEAK_NEEDLES) {
    expect(text).not.toContain(needle);
  }
  expect(text).not.toMatch(/at\s+\w+\s+\(/);
}

function assertNoSecrets(response) {
  const text = serialized(response);
  expect(text).not.toContain('passwordHash');
  expect(text).not.toContain('csrfHash');
  expect(text).not.toContain('tokenHash');
  expect(text).not.toContain('SESSION_SECRET');
}

async function csrf(baseUrl, jar) {
  return { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) };
}

describe('R1-F09-002 rate-limit isolation', () => {
  it('keeps the coded default at 20 attempts / 15 minutes', () => {
    const limiter = createAuthRateLimiter({ now: () => 1_000 });
    for (let i = 0; i < 20; i += 1) {
      limiter.assertAllowed('login:client');
    }
    expect(() => limiter.assertAllowed('login:client')).toThrow(/Too many authentication attempts/);
  });

  it('raises the ceiling only from server nodeEnv === test, never from client-shaped input', () => {
    expect(resolveAuthRateLimiterOptions('test')).toEqual({ maxAttempts: 10_000 });
    expect(resolveAuthRateLimiterOptions('development')).toEqual({});
    expect(resolveAuthRateLimiterOptions('production')).toEqual({});
    expect(resolveAuthRateLimiterOptions('production')).not.toHaveProperty('maxAttempts');
  });
});

describe('R1-F09-002 tenant-isolation attack suite', () => {
  it('blocks cross-org reads/writes across representative tenant-owned domains', async () => {
    const { server, baseUrl, jar } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F09 Attack Org A',
        ownerEmail: 'f09-attack-a@example.com',
        password: PASSWORD,
      });
      const orgB = await createApprovedOwner(baseUrl, jar, {
        organizationName: ORG_B_NAME,
        ownerEmail: 'f09-attack-b@example.com',
        password: PASSWORD,
      });
      expect(orgA.organizationId).not.toBe(orgB.organizationId);

      await login(baseUrl, jar, 'f09-attack-b@example.com', PASSWORD);
      const seeded = await seedOrgBRecords(baseUrl, jar);
      expect(seeded.customer.body.data.name).toBe(CUSTOMER_B_NAME);

      await login(baseUrl, jar, 'f09-attack-a@example.com', PASSWORD);
      const orgARead = await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar);
      expect(orgARead.status).toBe(200);
      expect(orgARead.body.data.id).toBe(orgA.organizationId);
      expect(orgARead.body.data.name).not.toBe(ORG_B_NAME);
      assertNoSecrets(orgARead);

      const stealSettings = await fetchJson(
        baseUrl,
        'PATCH',
        API_SETTINGS_PATH,
        {
          expectedVersion: 1,
          tradingName: 'Stolen',
          organizationId: orgB.organizationId,
        },
        await csrf(baseUrl, jar),
        jar,
      );
      if (stealSettings.status === 200) {
        expect(stealSettings.body.data.organizationId).toBe(orgA.organizationId);
        expect(serialized(stealSettings)).not.toContain(ORG_B_NAME);
      } else {
        assertOpaqueDenial(stealSettings);
      }

      const pathSteals = [
        ['GET', `${API_BRANCHES_PATH}/${seeded.branch.body.data.id}`],
        ['GET', `${API_WAREHOUSES_PATH}/${seeded.warehouse.body.data.id}`],
        ['GET', `${API_PRODUCT_CATEGORIES_PATH}/${seeded.category.body.data.id}`],
        ['GET', `${API_PRODUCTS_PATH}/${seeded.product.body.data.id}`],
        ['GET', `${API_CUSTOMERS_PATH}/${seeded.customer.body.data.id}`],
        ['GET', `${API_SUPPLIERS_PATH}/${seeded.supplier.body.data.id}`],
        ['GET', `${API_ACCOUNTS_PATH}/${seeded.account.body.data.id}`],
        ['GET', `${API_EXPENSE_CATEGORIES_PATH}/${seeded.expenseCategory.body.data.id}`],
        ['GET', `${API_INVENTORY_BATCHES_PATH}/${seeded.product.body.data.id}`],
        ['GET', `${API_PURCHASES_PATH}/${seeded.supplier.body.data.id}`],
        ['GET', `${API_SALES_PATH}/${seeded.customer.body.data.id}`],
        ['GET', `${API_RETURNS_PATH}/${seeded.customer.body.data.id}`],
        ['GET', `${API_IMPORTS_PATH}/${seeded.importJob.body.data.id}`],
        ['GET', `${API_AUDIT_EVENTS_PATH}/${seeded.category.body.data.id}`],
        ['GET', `${API_USERS_PATH}/${orgB.membershipId}`],
      ];
      for (const [method, path] of pathSteals) {
        const stolen = await fetchJson(baseUrl, method, path, undefined, {}, jar);
        assertOpaqueDenial(stolen);
      }

      const listedCustomers = await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar);
      expect(listedCustomers.status).toBe(200);
      expect(listedCustomers.body.data.items.every((item) => item.name !== CUSTOMER_B_NAME)).toBe(
        true,
      );

      const listedSuppliers = await fetchJson(baseUrl, 'GET', API_SUPPLIERS_PATH, undefined, {}, jar);
      expect(listedSuppliers.status).toBe(200);
      expect(listedSuppliers.body.data.items.every((item) => item.name !== SUPPLIER_B_NAME)).toBe(
        true,
      );

      const filterSteals = [
        `${API_CUSTOMERS_PATH}?organizationId=${orgB.organizationId}`,
        `${API_PURCHASES_PATH}?supplierId=${seeded.supplier.body.data.id}`,
        `${API_SALES_PATH}?customerId=${seeded.customer.body.data.id}`,
        `${API_INVENTORY_BATCHES_PATH}?warehouseId=${seeded.warehouse.body.data.id}`,
        `${API_ALERTS_PATH}?organizationId=${orgB.organizationId}`,
        `${API_REPORTS_PATH}?organizationId=${orgB.organizationId}`,
        `${API_AUDIT_EVENTS_PATH}?organizationId=${orgB.organizationId}`,
        `${API_IMPORTS_PATH}?organizationId=${orgB.organizationId}`,
      ];
      for (const path of filterSteals) {
        const filtered = await fetchJson(baseUrl, 'GET', path, undefined, {}, jar);
        expect(filtered.status).not.toBe(500);
        const text = serialized(filtered);
        expect(text).not.toContain(CUSTOMER_B_NAME);
        expect(text).not.toContain(SUPPLIER_B_NAME);
        expect(text).not.toContain(ORG_B_NAME);
      }

      const bodySteals = [
        [
          API_PRODUCTS_PATH,
          {
            name: 'Cross product',
            categoryId: seeded.category.body.data.id,
            trackingMode: 'none',
            baseUnitCode: 'KG',
            measurementDimension: 'mass',
          },
        ],
        [
          API_PURCHASES_PATH,
          {
            warehouseId: seeded.warehouse.body.data.id,
            supplierId: seeded.supplier.body.data.id,
            purchaseDate: '2026-08-01',
            lines: [
              {
                productId: seeded.product.body.data.id,
                quantity: '1',
                unitCost: '10.00',
              },
            ],
          },
        ],
        [
          API_SALES_PATH,
          {
            warehouseId: seeded.warehouse.body.data.id,
            customerId: seeded.customer.body.data.id,
            saleDate: '2026-08-01',
            lines: [{ productId: seeded.product.body.data.id, quantity: '1', unitPrice: '10.00' }],
          },
        ],
        [
          API_EXPENSES_PATH,
          {
            expenseCategoryId: seeded.expenseCategory.body.data.id,
            accountId: seeded.account.body.data.id,
            amount: { amount: '10.00', currency: 'PKR' },
            expenseDate: '2026-08-01',
          },
        ],
      ];
      for (const [path, body] of bodySteals) {
        const written = await fetchJson(baseUrl, 'POST', path, body, await csrf(baseUrl, jar), jar);
        expect([400, 403, 404]).toContain(written.status);
        assertNoSecrets(written);
        expect(serialized(written)).not.toContain(ORG_B_NAME);
      }

      const malformed = await fetchJson(
        baseUrl,
        'GET',
        `${API_PRODUCTS_PATH}/not-a-valid-id`,
        undefined,
        {},
        jar,
      );
      expect([400, 404]).toContain(malformed.status);
      expect(malformed.status).not.toBe(500);
      assertNoSecrets(malformed);

      const systemScopeQuery = await fetchJson(
        baseUrl,
        'GET',
        `${API_CUSTOMERS_PATH}?scope=${encodeURIComponent(SYSTEM_SCOPE)}`,
        undefined,
        {},
        jar,
      );
      expect(systemScopeQuery.status).toBe(200);
      expect(systemScopeQuery.body.data.items.every((item) => item.name !== CUSTOMER_B_NAME)).toBe(
        true,
      );
    } finally {
      await closeServer(server);
    }
  }, 120000);
});

describe('R1-F09-002 platform vs organization separation', () => {
  it('keeps platform APIs, org permissions, and system scope bypasses request-proof', async () => {
    const { server, baseUrl, jar, app } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F09 Platform Org',
        ownerEmail: 'f09-platform-org@example.com',
        password: PASSWORD,
      });
      await seedSuperAdmin(app.agrivio.auth.store, {
        email: 'f09-super-admin@example.com',
        password: PASSWORD,
      });

      await login(baseUrl, jar, 'f09-platform-org@example.com', PASSWORD);
      const orgPlatform = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_ORGANIZATIONS_PATH,
        undefined,
        {},
        jar,
      );
      expect(orgPlatform.status).toBe(403);

      const orgPlatformAudit = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_AUDIT_EVENTS_PATH,
        undefined,
        {},
        jar,
      );
      expect(orgPlatformAudit.status).toBe(403);

      let productionHeaderError;
      createPlatformActorMiddleware({ nodeEnv: 'production' })(
        { header: (name) => (name === API_PLATFORM_ACTOR_HEADER ? 'super-admin' : undefined) },
        {},
        (error) => {
          productionHeaderError = error;
        },
      );
      expect(productionHeaderError?.statusCode).toBe(403);

      const stealContext = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_SESSION_CONTEXT_PATH,
        { contextType: 'platform' },
        await csrf(baseUrl, jar),
        jar,
      );
      expect(stealContext.status).toBe(403);

      await login(baseUrl, jar, 'f09-super-admin@example.com', PASSWORD);
      const platformOrgApi = await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar);
      expect(platformOrgApi.status).toBe(403);

      const platformCustomers = await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar);
      expect(platformCustomers.status).toBe(403);

      const platformList = await fetchJson(
        baseUrl,
        'GET',
        API_PLATFORM_ORGANIZATIONS_PATH,
        undefined,
        {},
        jar,
      );
      expect(platformList.status).toBe(200);

      expect(() => createSystemScope('attacker', 'from-request')).toThrow(/Invalid system scope/);
      const systemScope = createSystemScope('platform maintenance', SYSTEM_SCOPE);
      expect(systemScope.mode).toBe('system');
    } finally {
      await closeServer(server);
    }
  }, 120000);
});

describe('R1-F09-002 authorization bypass', () => {
  it('enforces API permissions independently of hidden UI and adjacent roles', async () => {
    const { server, baseUrl, jar, app } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      const orgA = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F09 Authz Org',
        ownerEmail: 'f09-authz-owner@example.com',
        password: PASSWORD,
      });
      await seedOrgMember(app.agrivio.auth.store, {
        email: 'f09-cashier@example.com',
        password: PASSWORD,
        organizationId: orgA.organizationId,
        role: 'Cashier',
        branchId: 'branch-assigned',
        warehouseId: 'wh-assigned',
      });
      await seedOrgMember(app.agrivio.auth.store, {
        email: 'f09-storekeeper@example.com',
        password: PASSWORD,
        organizationId: orgA.organizationId,
        role: 'StoreKeeper',
      });

      await login(baseUrl, jar, 'f09-cashier@example.com', PASSWORD);
      const session = await fetchJson(baseUrl, 'GET', API_AUTH_SESSION_PATH, undefined, {}, jar);
      expect(session.status).toBe(200);
      expect(session.body.data.activeContext.permissions).not.toContain('purchases.view');
      expect(session.body.data.activeContext.permissions).not.toContain('catalog.manage');
      assertNoSecrets(session);

      const hiddenUiPurchases = await fetchJson(baseUrl, 'GET', API_PURCHASES_PATH, undefined, {}, jar);
      expect(hiddenUiPurchases.status).toBe(403);

      const hiddenUiReports = await fetchJson(baseUrl, 'GET', API_REPORTS_PATH, undefined, {}, jar);
      expect(hiddenUiReports.status).toBe(403);

      const hiddenUiManage = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Cashier should not', productClass: 'general' },
        await csrf(baseUrl, jar),
        jar,
      );
      expect(hiddenUiManage.status).toBe(403);

      const unassignedWarehouse = await fetchJson(
        baseUrl,
        'GET',
        `${API_WAREHOUSES_PATH}/wh-foreign-assignment`,
        undefined,
        {},
        jar,
      );
      expect([403, 404]).toContain(unassignedWarehouse.status);

      await login(baseUrl, jar, 'f09-storekeeper@example.com', PASSWORD);
      const adjacentCatalog = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Accountant adjacent', productClass: 'general' },
        await csrf(baseUrl, jar),
        jar,
      );
      expect(adjacentCatalog.status).toBe(403);

      const noAuth = await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, undefined);
      expect(noAuth.status).toBe(401);
    } finally {
      await closeServer(server);
    }
  }, 120000);
});

describe('R1-F09-002 CSRF and session attacks', () => {
  it('rejects CSRF gaps and enforces session rotation, logout, expiry, and cookie flags', async () => {
    const { server, baseUrl, jar, app } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F09 Csrf Org',
        ownerEmail: 'f09-csrf-owner@example.com',
        password: PASSWORD,
      });

      const preLoginToken = jar.get(API_SESSION_COOKIE_NAME);
      const loginResponse = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_LOGIN_PATH,
        { email: 'f09-csrf-owner@example.com', password: PASSWORD },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.setCookie.some((entry) => entry.includes('HttpOnly'))).toBe(true);
      expect(loginResponse.setCookie.some((entry) => /SameSite=Lax/i.test(entry))).toBe(true);
      expect(loginResponse.setCookie.some((entry) => entry.includes(API_SESSION_COOKIE_NAME))).toBe(
        true,
      );
      const postLoginToken = jar.get(API_SESSION_COOKIE_NAME);
      expect(postLoginToken).toBeTruthy();
      expect(postLoginToken).not.toBe(preLoginToken);

      const missingCsrf = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'No CSRF', productClass: 'general' },
        {},
        jar,
      );
      expect(missingCsrf.status).toBe(403);

      const invalidCsrf = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Bad CSRF', productClass: 'general' },
        { [API_CSRF_HEADER]: 'not-a-real-csrf-token' },
        jar,
      );
      expect(invalidCsrf.status).toBe(403);

      const mismatched = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Mismatched CSRF', productClass: 'general' },
        { [API_CSRF_HEADER]: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        jar,
      );
      expect(mismatched.status).toBe(403);

      const badOrigin = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Bad origin', productClass: 'general' },
        { ...(await csrf(baseUrl, jar)), origin: 'https://evil.example' },
        jar,
      );
      expect(badOrigin.status).toBe(403);

      const badReferer = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Bad referer', productClass: 'general' },
        { ...(await csrf(baseUrl, jar)), referer: 'https://evil.example/attack' },
        jar,
      );
      expect(badReferer.status).toBe(403);

      const allowed = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Allowed origin', productClass: 'general' },
        { ...(await csrf(baseUrl, jar)), origin: 'http://127.0.0.1:4200' },
        jar,
      );
      expect(allowed.status).toBe(201);

      await logout(baseUrl, jar);
      const afterLogout = await fetchJson(baseUrl, 'GET', API_AUTH_SESSION_PATH, undefined, {}, jar);
      expect(afterLogout.status).toBe(401);

      await login(baseUrl, jar, 'f09-csrf-owner@example.com', PASSWORD);
      const liveToken = jar.get(API_SESSION_COOKIE_NAME);
      const sessionRecord = await app.agrivio.auth.store.findSessionByTokenHash(hashToken(liveToken));
      expect(sessionRecord).not.toBeNull();
      await app.agrivio.auth.store.updateSession(null, String(sessionRecord._id), {
        expiresAt: new Date('2000-01-01T00:00:00.000Z'),
      });
      const expired = await fetchJson(baseUrl, 'GET', API_AUTH_SESSION_PATH, undefined, {}, jar);
      expect(expired.status).toBe(401);

      const resetUnknown = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_PASSWORD_RESET_REQUEST_PATH,
        { email: 'nobody-exists@example.com' },
        {},
        jar,
      );
      expect(resetUnknown.status).toBe(200);
      expect(resetUnknown.body.data.accepted).toBe(true);
      expect(resetUnknown.body.data).not.toHaveProperty('resetTokenForTest');

      const resetKnown = await fetchJson(
        baseUrl,
        'POST',
        API_AUTH_PASSWORD_RESET_REQUEST_PATH,
        {
          email: 'f09-csrf-owner@example.com',
          nodeEnv: 'test',
          maxAttempts: 1,
        },
        {
          'x-agrivio-node-env': 'production',
          'x-rate-limit-max': '1',
        },
        jar,
      );
      expect(resetKnown.status).toBe(200);
      expect(resetKnown.body.data.accepted).toBe(true);
      if (resetKnown.body.data.resetTokenForTest !== undefined) {
        expect(typeof resetKnown.body.data.resetTokenForTest).toBe('string');
      }
    } finally {
      await closeServer(server);
    }
  }, 120000);
});

describe('R1-F09-002 subscription bypass', () => {
  it('blocks suspended operational writes while allowing Frozen suspended reads', async () => {
    const { server, baseUrl, jar } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F09 Suspend Org',
        ownerEmail: 'f09-suspend-owner@example.com',
        password: PASSWORD,
      });
      await login(baseUrl, jar, 'f09-suspend-owner@example.com', PASSWORD);

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
        { expectedVersion: subscription.version, reason: 'F09 attack review' },
        { ...(await csrf(baseUrl, jar)), [API_PLATFORM_ACTOR_HEADER]: 'super-admin' },
        jar,
      );
      expect(suspended.status).toBe(200);

      const reportView = await fetchJson(baseUrl, 'GET', `${API_REPORTS_PATH}/sales`, undefined, {}, jar);
      expect(reportView.status).toBe(200);

      const dashboard = await fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar);
      expect(dashboard.status).toBe(403);

      const createMaster = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Suspended write', productClass: 'general' },
        await csrf(baseUrl, jar),
        jar,
      );
      expect(createMaster.status).toBe(403);

      const importPreview = await fetchJson(
        baseUrl,
        'POST',
        API_IMPORTS_PATH,
        { importType: 'product_categories' },
        await csrf(baseUrl, jar),
        jar,
      );
      expect(importPreview.status).toBe(403);

      const orgStillThere = await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar);
      expect(orgStillThere.status).toBe(200);
    } finally {
      await closeServer(server);
    }
  }, 120000);
});

describe('R1-F09-002 sensitive data and error review', () => {
  it('does not return hashes, reset tokens, or stack traces on representative protected endpoints', async () => {
    const { server, baseUrl, jar } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F09 Secrets Org',
        ownerEmail: 'f09-secrets-owner@example.com',
        password: PASSWORD,
      });
      await login(baseUrl, jar, 'f09-secrets-owner@example.com', PASSWORD);

      const session = await fetchJson(baseUrl, 'GET', API_AUTH_SESSION_PATH, undefined, {}, jar);
      expect(session.status).toBe(200);
      assertNoSecrets(session);
      expect(serialized(session)).not.toContain('resetTokenForTest');

      const users = await fetchJson(baseUrl, 'GET', API_USERS_PATH, undefined, {}, jar);
      expect(users.status).toBe(200);
      assertNoSecrets(users);

      const boom = await fetchJson(baseUrl, 'GET', '/api/v1/definitely-missing', undefined, {}, jar);
      expect(boom.status).toBe(404);
      expect(serialized(boom)).not.toMatch(/at\s+\w+\s+\(/);
    } finally {
      await closeServer(server);
    }
  }, 120000);
});

async function seedOrgBRecords(baseUrl, jar) {
  const headers = () => csrf(baseUrl, jar);
  const branch = await fetchJson(
    baseUrl,
    'POST',
    API_BRANCHES_PATH,
    { name: 'Branch B Secret', invoicePrefix: 'BSEC' },
    await headers(),
    jar,
  );
  expect(branch.status).toBe(201);
  const warehouse = await fetchJson(
    baseUrl,
    'POST',
    API_WAREHOUSES_PATH,
    { name: 'Warehouse B Secret' },
    await headers(),
    jar,
  );
  expect(warehouse.status).toBe(201);
  const category = await fetchJson(
    baseUrl,
    'POST',
    API_PRODUCT_CATEGORIES_PATH,
    { name: 'Org B Seed Secret', productClass: 'general' },
    await headers(),
    jar,
  );
  expect(category.status).toBe(201);
  const product = await fetchJson(
    baseUrl,
    'POST',
    API_PRODUCTS_PATH,
    {
      name: 'Product B Secret',
      categoryId: category.body.data.id,
      trackingMode: 'none',
      baseUnitCode: 'KG',
      measurementDimension: 'mass',
    },
    await headers(),
    jar,
  );
  expect(product.status).toBe(201);
  const customer = await fetchJson(
    baseUrl,
    'POST',
    API_CUSTOMERS_PATH,
    { name: CUSTOMER_B_NAME, customerType: 'farmer' },
    await headers(),
    jar,
  );
  expect(customer.status).toBe(201);
  const supplier = await fetchJson(
    baseUrl,
    'POST',
    API_SUPPLIERS_PATH,
    { name: SUPPLIER_B_NAME },
    await headers(),
    jar,
  );
  expect(supplier.status).toBe(201);
  const account = await fetchJson(
    baseUrl,
    'POST',
    API_ACCOUNTS_PATH,
    { name: 'Cash B Secret', accountType: 'cash' },
    await headers(),
    jar,
  );
  expect(account.status).toBe(201);
  const expenseCategory = await fetchJson(
    baseUrl,
    'POST',
    API_EXPENSE_CATEGORIES_PATH,
    { name: 'Expense B Secret' },
    await headers(),
    jar,
  );
  expect(expenseCategory.status).toBe(201);
  const importJob = await fetchJson(
    baseUrl,
    'POST',
    API_IMPORTS_PATH,
    { importType: 'product_categories' },
    await headers(),
    jar,
  );
  expect([200, 201]).toContain(importJob.status);
  return {
    branch,
    warehouse,
    category,
    product,
    customer,
    supplier,
    account,
    expenseCategory,
    importJob,
  };
}
