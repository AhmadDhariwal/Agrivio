import { describe, it, expect } from 'vitest';
import locationsModuleImport from './locations.module.js';

const { createLocationsModule } = locationsModuleImport;

function makeEvaluateEntitlement(limits = {}) {
  const defaults = {
    warehouses: Infinity,
    branches: Infinity,
    products: Infinity,
    customers: Infinity,
    suppliers: Infinity,
    users: Infinity,
  };
  const resolved = { ...defaults, ...limits };
  return async (_organizationId, { limitKey, currentUsage }) => {
    const max = resolved[limitKey] ?? Infinity;
    if (currentUsage >= max) {
      return { allowed: false, reason: 'limit_reached', limit: { max, limitKey } };
    }
    const softWarnAt = max < Infinity ? max - 1 : Infinity;
    if (currentUsage >= softWarnAt) {
      return { allowed: true, reason: 'soft_warning', limit: { max, limitKey, softWarning: true } };
    }
    return { allowed: true, reason: 'within_limit', limit: { max, limitKey } };
  };
}

function makeActor() {
  return { actorId: 'test-actor' };
}

describe('warehouse plan limits: createWarehouse', () => {
  it('allows creating the first warehouse on Starter plan (limit 1)', async () => {
    const { locationsService } = createLocationsModule({
      persistence: 'memory',
      evaluateEntitlement: makeEvaluateEntitlement({ warehouses: 1 }),
    });
    const result = await locationsService.createWarehouse('org-1', { name: 'Main Warehouse' }, makeActor());
    expect(result).toHaveProperty('name', 'Main Warehouse');
  });

  it('blocks creating a second warehouse on Starter plan (limit 1)', async () => {
    const { locationsService } = createLocationsModule({
      persistence: 'memory',
      evaluateEntitlement: makeEvaluateEntitlement({ warehouses: 1 }),
    });
    await locationsService.createWarehouse('org-2', { name: 'First Warehouse' }, makeActor());
    await expect(
      locationsService.createWarehouse('org-2', { name: 'Second Warehouse' }, makeActor()),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows creating up to 10 warehouses on Business plan (limit 10)', async () => {
    const { locationsService } = createLocationsModule({
      persistence: 'memory',
      evaluateEntitlement: makeEvaluateEntitlement({ warehouses: 10 }),
    });
    for (let i = 1; i <= 10; i++) {
      await locationsService.createWarehouse('org-biz', { name: `Warehouse ${i}` }, makeActor());
    }
    await expect(
      locationsService.createWarehouse('org-biz', { name: 'Warehouse 11' }, makeActor()),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('uses active warehouse count for creation limit (inactive do not consume slots)', async () => {
    const { locationsService } = createLocationsModule({
      persistence: 'memory',
      evaluateEntitlement: makeEvaluateEntitlement({ warehouses: 1 }),
    });
    // Create then deactivate first warehouse
    const first = await locationsService.createWarehouse('org-cnt', { name: 'Warehouse A' }, makeActor());
    await locationsService.updateWarehouse('org-cnt', first.id, {
      expectedVersion: first.version,
      status: 'inactive',
    }, makeActor());
    // Active count is 0 — should allow creating a new one
    const second = await locationsService.createWarehouse('org-cnt', { name: 'Warehouse B' }, makeActor());
    expect(second).toHaveProperty('name', 'Warehouse B');
  });
});

describe('warehouse plan limits: reactivation', () => {
  async function setupWithOneInactiveWarehouse(limits) {
    const { locationsService, store } = createLocationsModule({
      persistence: 'memory',
      evaluateEntitlement: makeEvaluateEntitlement(limits),
    });
    const first = await locationsService.createWarehouse('org-r', { name: 'Warehouse A' }, makeActor());
    const deactivated = await locationsService.updateWarehouse('org-r', first.id, {
      expectedVersion: first.version,
      status: 'inactive',
    }, makeActor());
    return { locationsService, store, inactiveWarehouse: deactivated };
  }

  it('blocks reactivating when another active warehouse is at the plan limit (Starter)', async () => {
    const { locationsService, inactiveWarehouse } = await setupWithOneInactiveWarehouse({ warehouses: 1 });
    // Create a second (now 1 active total, at the limit)
    await locationsService.createWarehouse('org-r', { name: 'Warehouse B' }, makeActor());
    // Reactivating the first would bring active count to 2, exceeding limit of 1
    await expect(
      locationsService.updateWarehouse('org-r', inactiveWarehouse.id, {
        expectedVersion: inactiveWarehouse.version,
        status: 'active',
      }, makeActor()),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows reactivating when active count is below plan limit', async () => {
    // Plan limit = 2, 0 active + 1 inactive → reactivation is allowed
    const { locationsService, inactiveWarehouse } = await setupWithOneInactiveWarehouse({ warehouses: 2 });
    const reactivated = await locationsService.updateWarehouse('org-r', inactiveWarehouse.id, {
      expectedVersion: inactiveWarehouse.version,
      status: 'active',
    }, makeActor());
    expect(reactivated).toHaveProperty('status', 'active');
  });

  it('allows deactivating a warehouse (not a plan-limit operation)', async () => {
    const { locationsService } = createLocationsModule({
      persistence: 'memory',
      evaluateEntitlement: makeEvaluateEntitlement({ warehouses: 1 }),
    });
    const warehouse = await locationsService.createWarehouse('org-deact', { name: 'W1' }, makeActor());
    const deactivated = await locationsService.updateWarehouse('org-deact', warehouse.id, {
      expectedVersion: warehouse.version,
      status: 'inactive',
    }, makeActor());
    expect(deactivated).toHaveProperty('status', 'inactive');
  });
});

describe('warehouse plan limits: plan downgrade preserves existing records', () => {
  it('does not delete warehouses when plan limit is reduced', async () => {
    // Create 3 warehouses under Business plan (limit 3)
    const bizModule = createLocationsModule({
      persistence: 'memory',
      evaluateEntitlement: makeEvaluateEntitlement({ warehouses: 3 }),
    });
    await bizModule.locationsService.createWarehouse('org-d', { name: 'W1' }, makeActor());
    await bizModule.locationsService.createWarehouse('org-d', { name: 'W2' }, makeActor());
    await bizModule.locationsService.createWarehouse('org-d', { name: 'W3' }, makeActor());

    // Re-use the same store with Starter plan entitlement (simulates downgrade)
    const starterModule = createLocationsModule({
      persistence: 'memory',
      store: bizModule.store,
      evaluateEntitlement: makeEvaluateEntitlement({ warehouses: 1 }),
    });

    // Existing warehouses remain accessible
    const list = await starterModule.locationsService.listWarehouses('org-d');
    expect(list.items).toHaveLength(3);

    // But creating a new warehouse is blocked
    await expect(
      starterModule.locationsService.createWarehouse('org-d', { name: 'W4' }, makeActor()),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
