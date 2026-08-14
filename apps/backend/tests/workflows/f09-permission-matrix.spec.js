import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  API_ACCOUNTS_PATH,
  API_ALERTS_PATH,
  API_AUDIT_EVENTS_PATH,
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_DASHBOARD_PATH,
  API_EXPENSES_PATH,
  API_IMPORTS_PATH,
  API_INVENTORY_BALANCES_PATH,
  API_ORGANIZATION_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PURCHASES_PATH,
  API_REPORTS_PATH,
  API_RETURNS_PATH,
  API_SALES_PATH,
  API_SETTINGS_PATH,
  API_STOCK_ADJUSTMENTS_PATH,
  API_SUPPLIERS_PATH,
  API_USERS_PATH,
  API_CUSTOMER_PAYMENTS_PATH,
} from '@agrivio/api-contracts';
import {
  PERMISSION_CATALOG,
  ROLE_MATRIX,
  permissionsForMembershipRole,
  permissionsForPlatformAccess,
} from '../../src/modules/identity/role-permissions.js';
import {
  bootF09App,
  closeServer,
  createApprovedOwner,
  fetchJson,
  issueCsrf,
  login,
  seedOrgMember,
  seedPlan,
  seedSuperAdmin,
} from './f09-http-harness.js';
import {
  KNOWN_UNIMPLEMENTED_FROZEN_ENDPOINTS,
  PUBLIC_OR_AUTH_ONLY_JUSTIFICATION,
  ROLE_KEYS,
  parseFrozenApiEndpoints,
  parseFrozenPermissionCatalog,
  parseFrozenRoleMatrix,
  repoPaths,
  scanImplementedRoutes,
} from './f09-permission-matrix-inventory.js';

const paths = repoPaths();
const securityMarkdown = readFileSync(paths.securityDoc, 'utf8');
const apiDesignMarkdown = readFileSync(paths.apiDesignDoc, 'utf8');
const frozenCatalog = parseFrozenPermissionCatalog(securityMarkdown);
const frozenMatrix = parseFrozenRoleMatrix(securityMarkdown);
const frozenEndpoints = parseFrozenApiEndpoints(apiDesignMarkdown);
const implementedRoutes = scanImplementedRoutes(paths.backendSrc);
const productionRoutes = implementedRoutes.filter((route) => !route.testOnly);

const PASSWORD = 'a-strong-passphrase';

describe('R1-F09-003 permission catalog', () => {
  it('matches the Frozen 81-permission catalog exactly', () => {
    expect(frozenCatalog.duplicates).toEqual([]);
    expect(frozenCatalog.codes).toHaveLength(81);
    expect(PERMISSION_CATALOG).toHaveLength(81);
    expect([...PERMISSION_CATALOG].sort()).toEqual([...frozenCatalog.codes].sort());
    expect(new Set(PERMISSION_CATALOG).size).toBe(81);

    const extra = PERMISSION_CATALOG.filter((code) => !frozenCatalog.codes.includes(code));
    const missing = frozenCatalog.codes.filter((code) => !PERMISSION_CATALOG.includes(code));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });
});

describe('R1-F09-003 role bundles', () => {
  it('matches Frozen matrix cells for all five roles without hierarchy inference', () => {
    expect(Object.keys(ROLE_MATRIX).sort()).toEqual([...frozenCatalog.codes].sort());
    expect(Object.keys(frozenMatrix).sort()).toEqual([...frozenCatalog.codes].sort());

    for (const permission of frozenCatalog.codes) {
      expect(ROLE_MATRIX[permission]).toEqual(frozenMatrix[permission]);
      expect(Object.keys(ROLE_MATRIX[permission]).sort()).toEqual([...ROLE_KEYS].sort());
    }

    const owner = new Set(permissionsForMembershipRole('Owner'));
    const manager = new Set(permissionsForMembershipRole('Manager'));
    const cashier = new Set(permissionsForMembershipRole('Cashier'));
    const storeKeeper = new Set(permissionsForMembershipRole('StoreKeeper'));
    const platform = new Set(permissionsForPlatformAccess('super_admin'));
    const platformWithRestore = new Set(
      permissionsForPlatformAccess('super_admin', ['operations.restore.execute']),
    );

    for (const permission of frozenCatalog.codes) {
      const cell = frozenMatrix[permission];
      expect(owner.has(permission)).toBe(cell.Owner === 'A');
      expect(manager.has(permission)).toBe(cell.Manager === 'A');
      expect(cashier.has(permission)).toBe(cell.Cashier === 'A');
      expect(storeKeeper.has(permission)).toBe(cell.StoreKeeper === 'A');
      expect(platform.has(permission)).toBe(
        cell.SuperAdmin === 'P' && permission !== 'operations.restore.execute',
      );
    }

    expect(owner.has('platform.organizations.view')).toBe(false);
    expect(platform.has('organization.view')).toBe(false);
    expect(platform.has('operations.restore.execute')).toBe(false);
    expect(platformWithRestore.has('operations.restore.execute')).toBe(true);
    expect(manager.has('inventory.negative-stock.override')).toBe(false);
    expect(manager.has('users.create')).toBe(false);
    expect(cashier.has('sales.cancel')).toBe(false);
    expect(cashier.has('purchases.view')).toBe(false);
    expect(storeKeeper.has('sales.view')).toBe(false);
    expect(storeKeeper.has('reports.view')).toBe(false);
    expect(
      permissionsForMembershipRole('Cashier', ['sales.cancel']).includes('sales.cancel'),
    ).toBe(false);
    expect(
      permissionsForMembershipRole('Manager', ['audit.view']).includes('audit.view'),
    ).toBe(true);
  });
});

describe('R1-F09-003 endpoint permission map', () => {
  it('guards Frozen protected endpoints and inventories extras without silent normalization', () => {
    const implementedKeys = new Set(productionRoutes.map((route) => route.key));
    const frozenKeys = new Set(frozenEndpoints.map((endpoint) => endpoint.key));

    const missingFrozen = frozenEndpoints
      .filter((endpoint) => !implementedKeys.has(endpoint.key))
      .map((endpoint) => endpoint.key)
      .sort();
    expect(missingFrozen).toEqual([...KNOWN_UNIMPLEMENTED_FROZEN_ENDPOINTS].sort());

    const mismatches = [];
    for (const frozen of frozenEndpoints) {
      if (KNOWN_UNIMPLEMENTED_FROZEN_ENDPOINTS.includes(frozen.key)) {
        continue;
      }
      const implemented = productionRoutes.find((route) => route.key === frozen.key);
      if (implemented === undefined) {
        mismatches.push(`missing ${frozen.key}`);
        continue;
      }
      if (frozen.publicOrAuthOnly) {
        expect(PUBLIC_OR_AUTH_ONLY_JUSTIFICATION[frozen.key]).toBeTruthy();
        expect(implemented.permissions).toEqual([]);
        continue;
      }
      const missingPermission = frozen.permissions.filter(
        (permission) => !implemented.permissions.includes(permission),
      );
      if (missingPermission.length > 0) {
        mismatches.push(`${frozen.key} missing ${missingPermission.join(',')}`);
      }
      const unexpected = implemented.permissions.filter(
        (permission) =>
          !frozen.permissions.includes(permission) && !PERMISSION_CATALOG.includes(permission),
      );
      if (unexpected.length > 0) {
        mismatches.push(`${frozen.key} unknown ${unexpected.join(',')}`);
      }
    }
    expect(mismatches).toEqual([]);

    const extras = productionRoutes.filter((route) => !frozenKeys.has(route.key));
    for (const extra of extras) {
      if (extra.permissions.length === 0) {
        expect([
          'GET /api/v1/health',
          'GET /api/v1/platform/operations/readiness',
        ]).toContain(extra.key);
        continue;
      }
      for (const permission of extra.permissions) {
        expect(PERMISSION_CATALOG).toContain(permission);
      }
    }

    const purchaseReturn = productionRoutes.find(
      (route) => route.key === 'POST /api/v1/purchases/:id/returns',
    );
    expect(purchaseReturn?.permissions).toEqual(
      expect.arrayContaining(['returns.post', 'purchases.return']),
    );
  });
});

describe('R1-F09-003 representative HTTP allow/deny', () => {
  it('proves allowed role, adjacent 403, and unauthenticated 401 across major domains', async () => {
    const { server, baseUrl, jar, app } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      const org = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F09 Matrix Org',
        ownerEmail: 'f09-matrix-owner@example.com',
        password: PASSWORD,
      });
      await seedOrgMember(app.agrivio.auth.store, {
        email: 'f09-matrix-manager@example.com',
        password: PASSWORD,
        organizationId: org.organizationId,
        role: 'Manager',
      });
      await seedOrgMember(app.agrivio.auth.store, {
        email: 'f09-matrix-cashier@example.com',
        password: PASSWORD,
        organizationId: org.organizationId,
        role: 'Cashier',
      });
      await seedOrgMember(app.agrivio.auth.store, {
        email: 'f09-matrix-store@example.com',
        password: PASSWORD,
        organizationId: org.organizationId,
        role: 'StoreKeeper',
      });
      await seedSuperAdmin(app.agrivio.auth.store, {
        email: 'f09-matrix-super@example.com',
        password: PASSWORD,
      });

      const unauth = await fetchJson(baseUrl, 'GET', API_SALES_PATH);
      expect(unauth.status).toBe(401);

      await login(baseUrl, jar, 'f09-matrix-owner@example.com', PASSWORD);
      const csrf = async () => ({ [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) });

      expect((await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar)).status).toBe(
        200,
      );
      expect((await fetchJson(baseUrl, 'GET', API_SETTINGS_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_USERS_PATH, undefined, {}, jar)).status).toBe(200);
      const ownerCategory = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Matrix Seed', productClass: 'seed' },
        await csrf(),
        jar,
      );
      expect(ownerCategory.status).toBe(201);
      expect((await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_SUPPLIERS_PATH, undefined, {}, jar)).status).toBe(200);
      expect(
        (await fetchJson(baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, undefined, {}, jar)).status,
      ).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_PURCHASES_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_SALES_PATH, undefined, {}, jar)).status).toBe(200);
      expect(
        (await fetchJson(baseUrl, 'GET', API_CUSTOMER_PAYMENTS_PATH, undefined, {}, jar)).status,
      ).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_RETURNS_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_ACCOUNTS_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_EXPENSES_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_ALERTS_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_REPORTS_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_AUDIT_EVENTS_PATH, undefined, {}, jar)).status).toBe(
        200,
      );
      expect((await fetchJson(baseUrl, 'GET', API_PLATFORM_ORGANIZATIONS_PATH, undefined, {}, jar)).status).toBe(
        403,
      );

      await login(baseUrl, jar, 'f09-matrix-manager@example.com', PASSWORD);
      expect((await fetchJson(baseUrl, 'GET', API_REPORTS_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_USERS_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'PATCH', API_ORGANIZATION_PATH, { name: 'x' }, await csrf(), jar)).status).toBe(
        403,
      );
      expect((await fetchJson(baseUrl, 'GET', API_AUDIT_EVENTS_PATH, undefined, {}, jar)).status).toBe(
        403,
      );
      expect(
        (
          await fetchJson(
            baseUrl,
            'POST',
            API_USERS_PATH,
            { email: 'blocked@example.com', displayName: 'Blocked' },
            await csrf(),
            jar,
          )
        ).status,
      ).toBe(403);

      await login(baseUrl, jar, 'f09-matrix-cashier@example.com', PASSWORD);
      expect((await fetchJson(baseUrl, 'GET', API_SALES_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar)).status).toBe(200);
      expect(
        (await fetchJson(baseUrl, 'GET', API_CUSTOMER_PAYMENTS_PATH, undefined, {}, jar)).status,
      ).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_PURCHASES_PATH, undefined, {}, jar)).status).toBe(403);
      expect((await fetchJson(baseUrl, 'GET', API_REPORTS_PATH, undefined, {}, jar)).status).toBe(403);
      expect((await fetchJson(baseUrl, 'GET', API_ACCOUNTS_PATH, undefined, {}, jar)).status).toBe(403);
      expect((await fetchJson(baseUrl, 'GET', API_AUDIT_EVENTS_PATH, undefined, {}, jar)).status).toBe(
        403,
      );
      expect((await fetchJson(baseUrl, 'POST', API_IMPORTS_PATH, { importType: 'products' }, await csrf(), jar)).status).toBe(
        403,
      );
      expect(
        (await fetchJson(baseUrl, 'POST', `${API_SALES_PATH}/missing/cancel`, {}, await csrf(), jar)).status,
      ).toBe(403);
      expect(
        (await fetchJson(baseUrl, 'POST', API_STOCK_ADJUSTMENTS_PATH, { warehouseId: 'wh-1' }, await csrf(), jar))
          .status,
      ).toBe(403);
      expect(
        (await fetchJson(baseUrl, 'POST', `${API_RETURNS_PATH}/without-invoice`, {}, await csrf(), jar)).status,
      ).toBe(403);
      expect(
        (await fetchJson(baseUrl, 'POST', API_PRODUCT_CATEGORIES_PATH, { name: 'No' }, await csrf(), jar))
          .status,
      ).toBe(403);

      await login(baseUrl, jar, 'f09-matrix-store@example.com', PASSWORD);
      expect((await fetchJson(baseUrl, 'GET', API_PURCHASES_PATH, undefined, {}, jar)).status).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_SUPPLIERS_PATH, undefined, {}, jar)).status).toBe(200);
      expect(
        (await fetchJson(baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, undefined, {}, jar)).status,
      ).toBe(200);
      expect((await fetchJson(baseUrl, 'GET', API_SALES_PATH, undefined, {}, jar)).status).toBe(403);
      expect((await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar)).status).toBe(403);
      expect((await fetchJson(baseUrl, 'GET', API_REPORTS_PATH, undefined, {}, jar)).status).toBe(403);
      expect(
        (await fetchJson(baseUrl, 'POST', `${API_PURCHASES_PATH}/missing/returns`, {}, await csrf(), jar)).status,
      ).toBe(403);

      await login(baseUrl, jar, 'f09-matrix-super@example.com', PASSWORD);
      expect((await fetchJson(baseUrl, 'GET', API_PLATFORM_ORGANIZATIONS_PATH, undefined, {}, jar)).status).toBe(
        200,
      );
      expect((await fetchJson(baseUrl, 'GET', API_ORGANIZATION_PATH, undefined, {}, jar)).status).toBe(
        403,
      );
      expect((await fetchJson(baseUrl, 'GET', API_SALES_PATH, undefined, {}, jar)).status).toBe(403);
    } finally {
      await closeServer(server);
    }
  }, 120000);
});
