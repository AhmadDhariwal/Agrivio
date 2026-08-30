import { describe, expect, it } from 'vitest';
import { ApiTransportErrorCode } from '@agrivio/api-contracts';
import { createEmployeesService, createInMemoryEmployeesStore } from './employees.module.js';
import { permissionsForMembershipRole } from './role-permissions.js';

function ownerActor() {
  return {
    actorId: 'owner-user',
    role: 'Owner',
    permissions: permissionsForMembershipRole('Owner'),
  };
}

function managerActor(assignments = { branchAssignments: [], warehouseAssignments: [] }) {
  return {
    actorId: 'manager-user',
    role: 'Manager',
    permissions: permissionsForMembershipRole('Manager'),
    contextType: 'organization',
    organizationId: 'org-1',
    ...assignments,
  };
}

describe('employee RBAC hierarchy and conditional grants', () => {
  function setup() {
    const store = createInMemoryEmployeesStore();
    store.users.set('owner-user', {
      _id: 'owner-user',
      email: 'owner@example.com',
      emailNormalized: 'owner@example.com',
      displayName: 'Owner',
      status: 'active',
      version: 1,
    });
    store.memberships.set('owner-mem', {
      _id: 'owner-mem',
      organizationId: 'org-1',
      userId: 'owner-user',
      role: 'Owner',
      status: 'active',
      conditionalPermissionGrants: [],
      version: 1,
    });
    const service = createEmployeesService({
      store,
      transactionRunner: { run: async (work) => work({}) },
      evaluateEntitlement: async () => ({ allowed: true }),
    });
    return { store, service };
  }

  it('lets Owner create Cashier/StoreKeeper and grant valid C permissions', async () => {
    const { service } = setup();
    const cashier = await service.createEmployee(
      'org-1',
      {
        email: 'cashier@example.com',
        displayName: 'Cashier One',
        role: 'Cashier',
        conditionalPermissionGrants: ['pricing.override', 'sales.create'],
      },
      ownerActor(),
    );
    expect(cashier.role).toBe('Cashier');
    expect(cashier.conditionalPermissionGrants).toEqual(['pricing.override']);
    expect(cashier.allowedActions.canManageConditionalGrants).toBe(true);

    const storeKeeper = await service.createEmployee(
      'org-1',
      {
        email: 'store@example.com',
        displayName: 'Store One',
        role: 'StoreKeeper',
      },
      ownerActor(),
    );
    expect(storeKeeper.role).toBe('StoreKeeper');
  });

  it('rejects N, P, and unknown conditional grants', async () => {
    const { service } = setup();
    await expect(
      service.createEmployee(
        'org-1',
        {
          email: 'n@example.com',
          displayName: 'N Grant',
          role: 'Cashier',
          conditionalPermissionGrants: ['sales.cancel'],
        },
        ownerActor(),
      ),
    ).rejects.toMatchObject({ code: ApiTransportErrorCode.ValidationFailed });

    await expect(
      service.createEmployee(
        'org-1',
        {
          email: 'p@example.com',
          displayName: 'P Grant',
          role: 'Cashier',
          conditionalPermissionGrants: ['platform.audit.view'],
        },
        ownerActor(),
      ),
    ).rejects.toMatchObject({ code: ApiTransportErrorCode.ValidationFailed });

    await expect(
      service.createEmployee(
        'org-1',
        {
          email: 'u@example.com',
          displayName: 'Unknown',
          role: 'Cashier',
          conditionalPermissionGrants: ['not.a.permission'],
        },
        ownerActor(),
      ),
    ).rejects.toMatchObject({ code: ApiTransportErrorCode.ValidationFailed });
  });

  it('lets Manager create Cashier and StoreKeeper but not Owner or Manager', async () => {
    const { service } = setup();
    const cashier = await service.createEmployee(
      'org-1',
      { email: 'c2@example.com', displayName: 'C2', role: 'Cashier' },
      managerActor(),
    );
    expect(cashier.role).toBe('Cashier');
    expect(cashier.allowedActions.canUpdate).toBe(true);

    const listed = await service.listEmployees('org-1', { skip: 0, pageSize: 25 }, managerActor());
    const cashierRow = listed.items.find((item) => item.role === 'Cashier');
    expect(cashierRow.allowedActions.canUpdate).toBe(true);
    expect(cashierRow.allowedActions.canDeactivate).toBe(true);
    const ownerRow = listed.items.find((item) => item.role === 'Owner');
    expect(ownerRow.allowedActions.canUpdate).toBe(false);
    expect(ownerRow.allowedActions.canDeactivate).toBe(false);

    await expect(
      service.createEmployee(
        'org-1',
        { email: 'mgr@example.com', displayName: 'Mgr', role: 'Manager' },
        managerActor(),
      ),
    ).rejects.toMatchObject({ code: ApiTransportErrorCode.RoleHierarchyDenied });

    await expect(
      service.createEmployee(
        'org-1',
        { email: 'own@example.com', displayName: 'Own', role: 'Owner' },
        managerActor(),
      ),
    ).rejects.toMatchObject({ code: ApiTransportErrorCode.RoleHierarchyDenied });
  });

  it('prevents Manager from editing Owner or assigning C-grants', async () => {
    const { service } = setup();
    await expect(
      service.updateEmployee(
        'org-1',
        'owner-user',
        { expectedVersion: 1, displayName: 'Hacked' },
        managerActor(),
      ),
    ).rejects.toMatchObject({ code: ApiTransportErrorCode.RoleHierarchyDenied });

    const cashier = await service.createEmployee(
      'org-1',
      { email: 'c3@example.com', displayName: 'C3', role: 'Cashier' },
      ownerActor(),
    );
    await expect(
      service.updateEmployee(
        'org-1',
        cashier.id,
        { expectedVersion: cashier.version, conditionalPermissionGrants: ['pricing.override'] },
        managerActor(),
      ),
    ).rejects.toMatchObject({ code: ApiTransportErrorCode.RoleHierarchyDenied });
  });

  it('drops invalid C-grants when role changes and revokes sessions', async () => {
    const { store, service } = setup();
    const cashier = await service.createEmployee(
      'org-1',
      {
        email: 'c4@example.com',
        displayName: 'C4',
        role: 'Cashier',
        conditionalPermissionGrants: ['pricing.override'],
      },
      ownerActor(),
    );
    const updated = await service.updateEmployee(
      'org-1',
      cashier.id,
      { expectedVersion: cashier.version, role: 'StoreKeeper' },
      ownerActor(),
    );
    expect(updated.role).toBe('StoreKeeper');
    expect(updated.conditionalPermissionGrants).toEqual([]);
  });

  it('protects the last active Owner from demotion and deactivation', async () => {
    const { service } = setup();
    await expect(
      service.updateEmployee(
        'org-1',
        'owner-user',
        { expectedVersion: 1, role: 'Manager' },
        ownerActor(),
      ),
    ).rejects.toMatchObject({ code: ApiTransportErrorCode.LastOwnerProtected });
    await expect(
      service.deactivateEmployee('org-1', 'owner-user', ownerActor()),
    ).rejects.toMatchObject({ code: ApiTransportErrorCode.LastOwnerProtected });
  });
});
