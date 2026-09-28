import { describe, expect, it } from 'vitest';
const { createEmployeesService, createInMemoryEmployeesStore } = require('./employees.module');
const { permissionsForMembershipRole } = require('./role-permissions');

function ownerActor() {
  return {
    actorId: 'owner-user',
    role: 'Owner',
    permissions: permissionsForMembershipRole('Owner'),
  };
}

function setup() {
  const store = createInMemoryEmployeesStore();
  store.users.set('owner-user', {
    _id: 'owner-user',
    email: 'owner@example.com',
    emailNormalized: 'owner@example.com',
    displayName: 'Owner',
    status: 'active',
    passwordHash: 'hash',
    version: 1,
  });
  store.memberships.set('owner-membership', {
    _id: 'owner-membership',
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

describe('pending employee invitation cancellation', () => {
  it('cancels only a never-used pending invitation and audits the tenant-scoped discard', async () => {
    const { store, service } = setup();
    const invitation = await service.createEmployee(
      'org-1',
      { email: 'pending@example.com', displayName: 'Pending', role: 'Cashier' },
      ownerActor(),
    );
    expect(invitation.status).toBe('pending');
    expect(invitation.allowedActions.canCancelInvitation).toBe(true);

    const result = await service.cancelPendingInvitation(
      'org-1',
      invitation.id,
      { expectedVersion: invitation.version },
      ownerActor(),
    );
    expect(result).toEqual({ id: invitation.id, invitationCancelled: true });
    expect(await store.findMembershipByOrganizationAndUserId('org-1', invitation.id)).toBeNull();
    expect(store.activationTokens.size).toBe(0);
    expect(store.listAuditsForTest().map((event) => event.action)).toContain(
      'user.invitation.cancelled',
    );
  });

  it('blocks active, used, cross-tenant, and stale invitation cancellation', async () => {
    const { store, service } = setup();
    const invitation = await service.createEmployee(
      'org-1',
      { email: 'pending2@example.com', displayName: 'Pending 2', role: 'StoreKeeper' },
      ownerActor(),
    );

    await expect(
      service.cancelPendingInvitation(
        'org-2',
        invitation.id,
        { expectedVersion: invitation.version },
        ownerActor(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      service.cancelPendingInvitation(
        'org-1',
        invitation.id,
        { expectedVersion: invitation.version + 1 },
        ownerActor(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const token = [...store.activationTokens.values()][0];
    store.activationTokens.set(String(token._id), { ...token, consumedAt: new Date() });
    await expect(
      service.cancelPendingInvitation(
        'org-1',
        invitation.id,
        { expectedVersion: invitation.version },
        ownerActor(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(
      service.cancelPendingInvitation(
        'org-1',
        'owner-user',
        { expectedVersion: 1 },
        ownerActor(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
