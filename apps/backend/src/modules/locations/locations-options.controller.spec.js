import { describe, expect, it, vi } from 'vitest';
import locationsControllerModule from './controllers/locations.controller';

const { createLocationsController } = locationsControllerModule;

function responseHarness() {
  const body = { value: null };
  return {
    body,
    response: {
      locals: { requestId: 'request-1' },
      status: vi.fn().mockReturnThis(),
      json: vi.fn((value) => {
        body.value = value;
      }),
    },
  };
}

function ownerAuthContext(organizationId) {
  return {
    organizationId,
    contextType: 'organization',
    role: 'Owner',
  };
}

describe('location option read models', () => {
  it('returns all active branches plus selected inactive branches without pagination', async () => {
    const listBranches = vi.fn().mockResolvedValue({
      items: [
        { id: 'active', name: 'Active', status: 'active' },
        { id: 'selected', name: 'Selected', status: 'inactive' },
        { id: 'other', name: 'Other', status: 'inactive' },
      ],
      total: 3,
    });
    const controller = createLocationsController({ locationsService: { listBranches } });
    const { body, response } = responseHarness();

    await controller.listBranchOptions(
      {
        authContext: ownerAuthContext('org-1'),
        query: { selectedIds: 'selected' },
      },
      response,
      vi.fn(),
    );

    expect(listBranches).toHaveBeenCalledWith('org-1');
    expect(body.value.data.items.map((item) => item.id)).toEqual(['active', 'selected']);
  });

  it('keeps warehouse options tenant-scoped and uncapped', async () => {
    const listWarehouses = vi.fn().mockResolvedValue({
      items: [{ id: 'warehouse-1', name: 'Main', status: 'active' }],
      total: 1,
    });
    const controller = createLocationsController({ locationsService: { listWarehouses } });
    const { body, response } = responseHarness();

    await controller.listWarehouseOptions(
      { authContext: ownerAuthContext('org-2'), query: {} },
      response,
      vi.fn(),
    );

    expect(listWarehouses).toHaveBeenCalledWith('org-2');
    expect(body.value.data.items).toHaveLength(1);
  });

  it('returns only assigned active branches for non-Owner users', async () => {
    const listBranches = vi.fn().mockResolvedValue({
      items: [
        { id: 'branch-a', name: 'A', status: 'active' },
        { id: 'branch-b', name: 'B', status: 'active' },
      ],
      total: 2,
    });
    const controller = createLocationsController({ locationsService: { listBranches } });
    const { body, response } = responseHarness();

    await controller.listBranchOptions(
      {
        authContext: {
          organizationId: 'org-1',
          contextType: 'organization',
          role: 'Cashier',
          branchAssignments: [{ targetId: 'branch-a', organizationId: 'org-1' }],
        },
        query: {},
      },
      response,
      vi.fn(),
    );

    expect(body.value.data.items.map((item) => item.id)).toEqual(['branch-a']);
  });
});
