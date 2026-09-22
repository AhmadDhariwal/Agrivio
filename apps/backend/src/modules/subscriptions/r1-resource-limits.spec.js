import { describe, expect, it } from 'vitest';
import { createCatalogModule } from '../catalog/catalog.module.js';
import { createSuppliersModule } from '../suppliers/suppliers.module.js';
import {
  createEmployeesModule,
  createInMemoryEmployeesStore,
} from '../identity/employees.module.js';
import { evaluateNumericLimit } from './entitlement.js';

const R1_LIMITS = [
  ['Starter', { products: 200, activeUsers: 2, suppliers: 50 }],
  ['Business', { products: 2000, activeUsers: 15, suppliers: 500 }],
  ['Enterprise', { products: 10000, activeUsers: 100, suppliers: 5000 }],
];

const actor = { actorId: 'owner-1', role: 'Owner' };

function evaluator(limitsByOrganization) {
  return async (organizationId, { limitKey, currentUsage }) =>
    evaluateNumericLimit(
      { limits: limitsByOrganization[String(organizationId)] },
      limitKey,
      currentUsage,
    );
}

describe.each(R1_LIMITS)('%s R1 resource limits', (planCode, limits) => {
  it(`allows product ${limits.products} and blocks product ${limits.products + 1}`, async () => {
    const organizationId = `org-products-${planCode}`;
    const usage = new Map([[organizationId, limits.products - 1]]);
    const catalog = createCatalogModule({
      persistence: 'memory',
      evaluateEntitlement: evaluator({ [organizationId]: limits }),
    });
    catalog.store.countProducts = async (requestedOrganizationId) =>
      usage.get(String(requestedOrganizationId)) ?? 0;
    const category = await catalog.catalogService.createCategory(
      organizationId,
      { name: 'General', productClass: 'general' },
      actor,
    );

    await expect(
      catalog.catalogService.createProduct(
        organizationId,
        {
          sku: `${planCode}-LAST`,
          name: 'Last allowed product',
          categoryId: category.id,
          trackingMode: 'none',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
        actor,
      ),
    ).resolves.toMatchObject({ name: 'Last allowed product' });

    usage.set(organizationId, limits.products);
    await expect(
      catalog.catalogService.createProduct(
        organizationId,
        {
          sku: `${planCode}-OVER`,
          name: 'Over-limit product',
          categoryId: category.id,
          trackingMode: 'none',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 403, message: 'Plan limit reached for products' });
  });

  it(`allows active user ${limits.activeUsers} and blocks active user ${limits.activeUsers + 1}`, async () => {
    const organizationId = `org-users-${planCode}`;
    const usage = new Map([[organizationId, limits.activeUsers - 1]]);
    const store = createInMemoryEmployeesStore();
    store.countActiveUsers = async (requestedOrganizationId) =>
      usage.get(String(requestedOrganizationId)) ?? 0;
    const employees = createEmployeesModule({
      persistence: 'memory',
      store,
      publicWebBaseUrl: 'http://localhost:4200',
      evaluateEntitlement: evaluator({ [organizationId]: limits }),
    });

    await expect(
      employees.employeesService.createEmployee(
        organizationId,
        {
          email: `${planCode.toLowerCase()}-last@example.com`,
          displayName: 'Last allowed user',
          role: 'Cashier',
        },
        actor,
      ),
    ).resolves.toMatchObject({ role: 'Cashier', status: 'pending' });

    usage.set(organizationId, limits.activeUsers);
    await expect(
      employees.employeesService.createEmployee(
        organizationId,
        {
          email: `${planCode.toLowerCase()}-over@example.com`,
          displayName: 'Over-limit user',
          role: 'Cashier',
        },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 403, message: 'Plan limit reached for activeUsers' });
  });

  it(`allows supplier ${limits.suppliers} and blocks supplier ${limits.suppliers + 1}`, async () => {
    const organizationId = `org-suppliers-${planCode}`;
    const usage = new Map([[organizationId, limits.suppliers - 1]]);
    const suppliers = createSuppliersModule({
      persistence: 'memory',
      evaluateEntitlement: evaluator({ [organizationId]: limits }),
    });
    suppliers.store.countSuppliers = async (requestedOrganizationId) =>
      usage.get(String(requestedOrganizationId)) ?? 0;

    await expect(
      suppliers.suppliersService.createSupplier(
        organizationId,
        { name: `${planCode} Last Supplier` },
        actor,
      ),
    ).resolves.toMatchObject({ name: `${planCode} Last Supplier` });

    usage.set(organizationId, limits.suppliers);
    await expect(
      suppliers.suppliersService.createSupplier(
        organizationId,
        { name: `${planCode} Over Supplier` },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 403, message: 'Plan limit reached for suppliers' });
  });
});

describe('R1 resource-limit counting invariants', () => {
  it('counts active and pending memberships, excludes inactive, and isolates organizations', async () => {
    const store = createInMemoryEmployeesStore();
    store.memberships.set('active-a', {
      _id: 'active-a',
      organizationId: 'org-a',
      userId: 'user-a',
      status: 'active',
    });
    store.memberships.set('pending-a', {
      _id: 'pending-a',
      organizationId: 'org-a',
      userId: 'user-b',
      status: 'pending',
    });
    store.memberships.set('inactive-a', {
      _id: 'inactive-a',
      organizationId: 'org-a',
      userId: 'user-c',
      status: 'inactive',
    });
    store.memberships.set('active-b', {
      _id: 'active-b',
      organizationId: 'org-b',
      userId: 'user-d',
      status: 'active',
    });

    await expect(store.countActiveUsers('org-a')).resolves.toBe(2);
    await expect(store.countActiveUsers('org-b')).resolves.toBe(1);
  });

  it('passes the tenant identity to the product and supplier quota checks', async () => {
    const limitsByOrganization = {
      'org-at-limit': { products: 1, suppliers: 1 },
      'org-with-room': { products: 1, suppliers: 1 },
    };
    const usage = new Map([
      ['org-at-limit', 1],
      ['org-with-room', 0],
    ]);
    const evaluateEntitlement = evaluator(limitsByOrganization);
    const catalog = createCatalogModule({ persistence: 'memory', evaluateEntitlement });
    catalog.store.countProducts = async (organizationId) => usage.get(String(organizationId));
    const suppliers = createSuppliersModule({ persistence: 'memory', evaluateEntitlement });
    suppliers.store.countSuppliers = async (organizationId) => usage.get(String(organizationId));
    const blockedCategory = await catalog.catalogService.createCategory(
      'org-at-limit',
      { name: 'Blocked', productClass: 'general' },
      actor,
    );
    const allowedCategory = await catalog.catalogService.createCategory(
      'org-with-room',
      { name: 'Allowed', productClass: 'general' },
      actor,
    );

    await expect(
      catalog.catalogService.createProduct(
        'org-at-limit',
        {
          name: 'Blocked',
          categoryId: blockedCategory.id,
          trackingMode: 'none',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      catalog.catalogService.createProduct(
        'org-with-room',
        {
          name: 'Allowed',
          categoryId: allowedCategory.id,
          trackingMode: 'none',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
        actor,
      ),
    ).resolves.toMatchObject({ name: 'Allowed' });
    await expect(
      suppliers.suppliersService.createSupplier('org-at-limit', { name: 'Blocked' }, actor),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      suppliers.suppliersService.createSupplier('org-with-room', { name: 'Allowed' }, actor),
    ).resolves.toMatchObject({ name: 'Allowed' });
  });
});
