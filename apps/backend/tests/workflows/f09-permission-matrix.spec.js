import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  API_CSRF_HEADER,
  API_PRODUCT_CATEGORIES_PATH,
  API_PURCHASES_PATH,
  API_SALES_PATH,
} from '@agrivio/api-contracts';
import {
  PERMISSION_CATALOG,
  ROLE_MATRIX,
  permissionsForMembershipRole,
  permissionsForPlatformAccess,
} from '../../src/modules/identity/role-permissions.js';
import {
  collectSourceFiles,
} from '../../src/platform/architecture/boundary-scan.js';
import {
  bootF09App,
  closeServer,
  createApprovedOwner,
  fetchJson,
  issueCsrf,
  login,
  seedOrgMember,
  seedPlan,
} from './f09-http-harness.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const backendSrc = join(here, '../../src');

const ROUTELESS_RESERVED = new Set([
  'payments.correct',
  'platform.organizations.create',
  'platform.organizations.suspend',
]);

const ROLE_KEYS = ['SuperAdmin', 'Owner', 'Manager', 'Cashier', 'StoreKeeper'];

describe('R1-F09-003 permission-matrix verification', () => {
  it('matches the frozen 81-permission catalog and role cells', () => {
    expect(PERMISSION_CATALOG).toHaveLength(81);
    expect(Object.keys(ROLE_MATRIX).sort()).toEqual([...PERMISSION_CATALOG].sort());
    for (const permission of PERMISSION_CATALOG) {
      const row = ROLE_MATRIX[permission];
      expect(Object.keys(row).sort()).toEqual([...ROLE_KEYS].sort());
    }

    const owner = new Set(permissionsForMembershipRole('Owner'));
    const cashier = new Set(permissionsForMembershipRole('Cashier'));
    const storeKeeper = new Set(permissionsForMembershipRole('StoreKeeper'));
    const platform = new Set(permissionsForPlatformAccess('super_admin'));

    for (const permission of PERMISSION_CATALOG) {
      const cell = ROLE_MATRIX[permission];
      expect(owner.has(permission)).toBe(cell.Owner === 'A');
      expect(cashier.has(permission)).toBe(cell.Cashier === 'A');
      expect(storeKeeper.has(permission)).toBe(cell.StoreKeeper === 'A');
      expect(platform.has(permission)).toBe(cell.SuperAdmin === 'P' && permission !== 'operations.restore.execute');
    }
  });

  it('maps every catalog permission onto a route, service check, or reserved Release 1 exception', () => {
    const used = new Set();
    const permissionPattern = /'([a-z0-9.-]+\.[a-z0-9.-]+(?:\.[a-z0-9.-]+)*)'/g;
    for (const filePath of collectSourceFiles(backendSrc)) {
      const normalized = filePath.replaceAll('\\', '/');
      if (normalized.endsWith('/role-permissions.js') || normalized.includes('.spec.')) {
        continue;
      }
      const source = readFileSync(filePath, 'utf8');
      let match = permissionPattern.exec(source);
      while (match !== null) {
        if (PERMISSION_CATALOG.includes(match[1])) {
          used.add(match[1]);
        }
        match = permissionPattern.exec(source);
      }
    }

    const missing = PERMISSION_CATALOG.filter(
      (permission) => !used.has(permission) && !ROUTELESS_RESERVED.has(permission),
    );
    expect(missing).toEqual([]);
  });

  it('denies Cashier purchases and StoreKeeper sales while allowing Owner catalog manage', async () => {
    const { server, baseUrl, jar, app } = await bootF09App();
    try {
      await seedPlan(baseUrl, jar);
      const org = await createApprovedOwner(baseUrl, jar, {
        organizationName: 'F09 Matrix Org',
        ownerEmail: 'f09-matrix-owner@example.com',
        password: 'a-strong-passphrase',
      });
      await seedOrgMember(app.agrivio.auth.store, {
        email: 'f09-matrix-cashier@example.com',
        password: 'a-strong-passphrase',
        organizationId: org.organizationId,
        role: 'Cashier',
      });
      await seedOrgMember(app.agrivio.auth.store, {
        email: 'f09-matrix-store@example.com',
        password: 'a-strong-passphrase',
        organizationId: org.organizationId,
        role: 'StoreKeeper',
      });

      await login(baseUrl, jar, 'f09-matrix-owner@example.com', 'a-strong-passphrase');
      const ownerCategory = await fetchJson(
        baseUrl,
        'POST',
        API_PRODUCT_CATEGORIES_PATH,
        { name: 'Matrix Seed', productClass: 'seed' },
        { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
        jar,
      );
      expect(ownerCategory.status).toBe(201);
      const ownerPurchases = await fetchJson(baseUrl, 'GET', API_PURCHASES_PATH, undefined, {}, jar);
      expect(ownerPurchases.status).toBe(200);

      await login(baseUrl, jar, 'f09-matrix-cashier@example.com', 'a-strong-passphrase');
      const cashierPurchases = await fetchJson(baseUrl, 'GET', API_PURCHASES_PATH, undefined, {}, jar);
      expect(cashierPurchases.status).toBe(403);
      const cashierSales = await fetchJson(baseUrl, 'GET', API_SALES_PATH, undefined, {}, jar);
      expect(cashierSales.status).toBe(200);

      await login(baseUrl, jar, 'f09-matrix-store@example.com', 'a-strong-passphrase');
      const storeSales = await fetchJson(baseUrl, 'GET', API_SALES_PATH, undefined, {}, jar);
      expect(storeSales.status).toBe(403);
      const storePurchases = await fetchJson(baseUrl, 'GET', API_PURCHASES_PATH, undefined, {}, jar);
      expect(storePurchases.status).toBe(200);
    } finally {
      await closeServer(server);
    }
  });
});
