import { describe, expect, it } from 'vitest';
import { createCatalogModule } from './catalog.module.js';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';

describe('catalog SKU lookup', () => {
  it('finds a product by SKU without scanning unrelated names', async () => {
    const catalog = createCatalogModule({
      persistence: 'memory',
      evaluateEntitlement: async () => ({ allowed: true }),
    });
    const actor = {
      actorId: 'owner-1',
      authContext: {
        userId: 'owner-1',
        organizationId: 'org-search',
        permissions: permissionsForMembershipRole('Owner'),
      },
    };
    const category = await catalog.catalogService.createCategory(
      'org-search',
      { name: 'Search Cat', productClass: 'general' },
      actor,
    );
    await catalog.catalogService.createProduct(
      'org-search',
      {
        name: 'Alpha',
        sku: 'sku-alpha',
        categoryId: category.id,
        trackingMode: 'none',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      },
      actor,
    );
    const found = await catalog.catalogService.findProductBySku('org-search', 'SKU-ALPHA');
    expect(found?.name).toBe('Alpha');
    const listed = await catalog.catalogService.listProducts('org-search', {
      q: 'SKU-ALPHA',
      limit: 5,
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0].sku).toBe('SKU-ALPHA');
  });
});
