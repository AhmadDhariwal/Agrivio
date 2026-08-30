import { describe, expect, it } from 'vitest';
import { createEmployeesService, createInMemoryEmployeesStore } from './employees.module';

describe('Employees list read model', () => {
  it('returns organization-wide lifecycle summary metadata with paginated items', async () => {
    const store = createInMemoryEmployeesStore();
    const organizationId = 'org-1';

    const users = [
      { _id: 'user-1', email: 'a@example.com', emailNormalized: 'a@example.com', displayName: 'A', status: 'active' },
      { _id: 'user-2', email: 'b@example.com', emailNormalized: 'b@example.com', displayName: 'B', status: 'active' },
      { _id: 'user-3', email: 'c@example.com', emailNormalized: 'c@example.com', displayName: 'C', status: 'pending_activation' },
    ];
    for (const user of users) {
      store.users.set(String(user._id), user);
    }

    const memberships = [
      { _id: 'mem-1', organizationId, userId: 'user-1', role: 'Cashier', status: 'active', createdAt: '2026-01-03T00:00:00.000Z' },
      { _id: 'mem-2', organizationId, userId: 'user-2', role: 'Manager', status: 'active', createdAt: '2026-01-02T00:00:00.000Z' },
      { _id: 'mem-3', organizationId, userId: 'user-3', role: 'Cashier', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    for (const membership of memberships) {
      store.memberships.set(String(membership._id), membership);
    }

    const service = createEmployeesService({
      store,
      transactionRunner: { run: async (work) => work({}) },
    });

    const result = await service.listEmployees(organizationId, { skip: 0, pageSize: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(3);
    expect(result.summary).toEqual({
      total: 3,
      active: 2,
      pendingInactive: 1,
    });
  });
});
