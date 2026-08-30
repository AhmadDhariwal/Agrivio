import { describe, expect, it } from 'vitest';
import { createInMemoryCustomersStore } from './customers.store.js';

describe('customers pagination', () => {
  it('returns at most pageSize items with matching meta for page=1 pageSize=10 total=37', async () => {
    const store = createInMemoryCustomersStore();
    for (let index = 0; index < 37; index += 1) {
      await store.insertCustomer(null, {
        organizationId: 'org-1',
        name: `Customer ${index + 1}`,
        nameNormalized: `customer ${index + 1}`,
        customerType: 'individual',
        priceTier: 'retail',
        status: 'active',
        version: 1,
      });
    }

    const result = await store.listCustomers('org-1', { status: 'active' }, { skip: 0, pageSize: 10 });

    expect(result.total).toBe(37);
    expect(result.items).toHaveLength(10);
  });

  it('returns the partial final page for page=4 pageSize=10 total=37', async () => {
    const store = createInMemoryCustomersStore();
    for (let index = 0; index < 37; index += 1) {
      await store.insertCustomer(null, {
        organizationId: 'org-1',
        name: `Customer ${index + 1}`,
        nameNormalized: `customer ${index + 1}`,
        customerType: 'individual',
        priceTier: 'retail',
        status: 'active',
        version: 1,
      });
    }

    const result = await store.listCustomers('org-1', { status: 'active' }, { skip: 30, pageSize: 10 });

    expect(result.total).toBe(37);
    expect(result.items).toHaveLength(7);
  });
});
