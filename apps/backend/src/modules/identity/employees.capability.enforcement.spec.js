import { describe, expect, it, vi } from 'vitest';
import employeesModule from './employees.module';

const capabilityDenied = Object.assign(new Error('Organization action not allowed'), {
  code: 'ORG_ACTION_NOT_ALLOWED',
});

describe('Employees capability enforcement', () => {
  it('asserts create, patch, deactivate, and assign-access capability checks', async () => {
    const capabilityService = {
      assertEmployeeCreateAllowed: vi.fn(),
      assertEmployeePatchAllowed: vi.fn(),
      assertEmployeeDeactivateAllowed: vi.fn(),
      assertEmployeeAssignAccessAllowed: vi.fn().mockRejectedValue(capabilityDenied),
    };

    const { createEmployeesService } = employeesModule;
    const store = {
      countActiveUsers: vi.fn().mockResolvedValue(0),
      findUserByEmailNormalized: vi.fn().mockResolvedValue(null),
      insertUser: vi.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'a@example.com',
        displayName: 'A',
        status: 'pending_activation',
        version: 1,
      }),
      insertMembership: vi.fn().mockResolvedValue({
        _id: 'mem-1',
        userId: 'user-1',
        role: 'Cashier',
        status: 'pending',
        version: 1,
      }),
      consumeOpenActivationTokens: vi.fn(),
      insertActivationToken: vi.fn(),
      appendAuditEvent: vi.fn(),
      listAccessAssignmentsByMembershipId: vi.fn().mockResolvedValue([]),
      findMembershipByOrganizationAndUserId: vi.fn().mockResolvedValue({
        _id: 'mem-1',
        userId: 'user-1',
        role: 'Cashier',
        status: 'active',
        version: 1,
      }),
      findUserById: vi.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'a@example.com',
        displayName: 'A',
        status: 'active',
        version: 1,
      }),
      updateMembership: vi.fn().mockResolvedValue({
        _id: 'mem-1',
        userId: 'user-1',
        role: 'Cashier',
        status: 'deactivated',
        version: 2,
      }),
      updateUser: vi.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'a@example.com',
        displayName: 'A',
        status: 'active',
        version: 1,
      }),
      revokeAllSessionsForUser: vi.fn(),
      listMembershipsByOrganizationId: vi.fn().mockResolvedValue([
        {
          _id: 'owner-mem',
          userId: 'owner-user',
          role: 'Owner',
          status: 'active',
        },
        {
          _id: 'mem-1',
          userId: 'user-1',
          role: 'Cashier',
          status: 'active',
        },
      ]),
    };

    const transactionRunner = {
      run: vi.fn(async (work) => work({})),
    };

    const service = createEmployeesService({
      store,
      transactionRunner,
      capabilityService,
      evaluateEntitlement: vi.fn().mockResolvedValue({ allowed: true }),
    });

    await service.createEmployee(
      'org-1',
      { email: 'a@example.com', displayName: 'A', role: 'Cashier' },
      { actorId: 'owner-1', role: 'Owner', permissions: ['users.create', 'users.update', 'users.deactivate'] },
    );
    expect(capabilityService.assertEmployeeCreateAllowed).toHaveBeenCalledWith('org-1');

    await service.updateEmployee(
      'org-1',
      'user-1',
      { expectedVersion: 1, displayName: 'Updated' },
      { actorId: 'owner-1', role: 'Owner', permissions: ['users.create', 'users.update', 'users.deactivate'] },
    );
    expect(capabilityService.assertEmployeePatchAllowed).toHaveBeenCalledWith(
      'org-1',
      { displayName: 'A', role: 'Cashier' },
      { displayName: 'Updated' },
    );

    await service.deactivateEmployee('org-1', 'user-1', {
      actorId: 'owner-1',
      role: 'Owner',
      permissions: ['users.create', 'users.update', 'users.deactivate'],
    });
    expect(capabilityService.assertEmployeeDeactivateAllowed).toHaveBeenCalledWith('org-1');

    const locationsModule = require('../locations/locations.module');
    const locationsService = locationsModule.createLocationsService({
      store: {
        findBranchById: vi.fn(),
        findWarehouseById: vi.fn(),
        listAccessAssignmentsByMembershipId: vi.fn().mockResolvedValue([]),
        appendAuditEvent: vi.fn(),
      },
      transactionRunner,
      findMembershipInOrganization: vi.fn().mockResolvedValue({
        _id: 'mem-1',
        userId: 'user-1',
        role: 'Cashier',
      }),
      capabilityService,
    });

    await expect(
      locationsService.replaceAccessAssignments(
        'org-1',
        'user-1',
        { branchIds: [], warehouseIds: [] },
        { actorId: 'owner-1' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
    expect(capabilityService.assertEmployeeAssignAccessAllowed).toHaveBeenCalledWith('org-1');
  });
});
