import { describe, expect, it } from 'vitest';
import { createCatalogModule } from '../../src/modules/catalog/catalog.module.js';
import { permissionsForMembershipRole } from '../../src/modules/identity/role-permissions.js';

const PLANNING_LIST_MS = 2_000;
const CATALOG_SIZE = 250;

describe('R1-F09-004 performance baselines', () => {
  it('lists a large in-memory catalog within the Release 1 planning threshold', async () => {
    const catalog = createCatalogModule({
      persistence: 'memory',
      evaluateEntitlement: async () => ({ allowed: true }),
    });
    const actor = {
      actorId: 'owner-1',
      authContext: {
        userId: 'owner-1',
        organizationId: 'org-perf',
        permissions: permissionsForMembershipRole('Owner'),
      },
    };
    const category = await catalog.catalogService.createCategory(
      'org-perf',
      { name: 'Perf General', productClass: 'general' },
      actor,
    );

    for (let i = 0; i < CATALOG_SIZE; i += 1) {
      await catalog.catalogService.createProduct(
        'org-perf',
        {
          name: `Perf Product ${i}`,
          sku: `PERF-${String(i).padStart(4, '0')}`,
          categoryId: category.id,
          trackingMode: 'none',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
        actor,
      );
    }

    const started = Date.now();
    const listed = await catalog.catalogService.listProducts('org-perf');
    const elapsed = Date.now() - started;
    expect(listed.items).toHaveLength(CATALOG_SIZE);
    expect(elapsed).toBeLessThan(PLANNING_LIST_MS);
  });
});
