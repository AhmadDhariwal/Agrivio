// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPlatformOrgService } from '../services/platform-org.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrgStore(overrides = {}) {
  return {
    findById: vi.fn().mockResolvedValue({ _id: 'org-001', status: 'pending', name: 'Test Org' }),
    activate: vi.fn().mockResolvedValue(undefined),
    reject: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeMembershipStore(overrides = {}) {
  return {
    activateOwner: vi.fn().mockResolvedValue({ userId: 'user-001' }),
    findByOrgAndRole: vi.fn().mockResolvedValue({ userId: 'user-001' }),
    ...overrides,
  };
}

function makeActivationTokenStore(overrides = {}) {
  return {
    createForUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeSubscriptionStore(overrides = {}) {
  return {
    createForOrg: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAuditWriter() {
  const events = /** @type {unknown[]} */ ([]);
  return {
    appendBusinessEvent: vi.fn().mockImplementation((_session, event) => {
      events.push(event);
      return Promise.resolve();
    }),
    getEvents: () => events,
  };
}

/** In-memory synchronous transaction runner (mirrors real runner behavior without DB). */
function makeSyncTransactionRunner() {
  return {
    run: vi.fn().mockImplementation(async (work) => {
      return work('mock-session');
    }),
  };
}

function makeService(overrides = {}) {
  return createPlatformOrgService({
    organizationStore: makeOrgStore(),
    membershipStore: makeMembershipStore(),
    activationTokenStore: makeActivationTokenStore(),
    subscriptionStore: makeSubscriptionStore(),
    auditWriter: makeAuditWriter(),
    transactionRunner: makeSyncTransactionRunner(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// listOrganizations / getOrganization
// ---------------------------------------------------------------------------

describe('platformOrgService — list and get', () => {
  it('lists organizations with no filter', async () => {
    const orgStore = makeOrgStore({ list: vi.fn().mockResolvedValue([{ _id: 'org-1' }]) });
    const service = makeService({ organizationStore: orgStore });

    const orgs = await service.listOrganizations({});
    expect(orgs).toHaveLength(1);
    expect(orgStore.list).toHaveBeenCalledWith({});
  });

  it('lists organizations with status filter', async () => {
    const orgStore = makeOrgStore({
      list: vi.fn().mockResolvedValue([{ _id: 'org-1', status: 'pending' }]),
    });
    const service = makeService({ organizationStore: orgStore });

    await service.listOrganizations({ status: 'pending' });
    expect(orgStore.list).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('throws NOT_FOUND for missing organization', async () => {
    const service = makeService({
      organizationStore: makeOrgStore({ findById: vi.fn().mockResolvedValue(null) }),
    });
    await expect(service.getOrganization('nonexistent-id')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// decideOrganization — approve
// ---------------------------------------------------------------------------

describe('platformOrgService — approve', () => {
  let orgStore;
  let membershipStore;
  let subscriptionStore;
  let activationTokenStore;
  let auditWriter;
  let transactionRunner;
  /** @type {ReturnType<typeof createPlatformOrgService>} */
  let service;

  beforeEach(() => {
    orgStore = makeOrgStore();
    membershipStore = makeMembershipStore();
    subscriptionStore = makeSubscriptionStore();
    activationTokenStore = makeActivationTokenStore();
    auditWriter = makeAuditWriter();
    transactionRunner = makeSyncTransactionRunner();
    service = createPlatformOrgService({
      organizationStore: orgStore,
      membershipStore,
      activationTokenStore,
      subscriptionStore,
      auditWriter,
      transactionRunner,
    });
  });

  it('approves a pending org and returns a plaintext activation token', async () => {
    const result = await service.decideOrganization({
      orgId: 'org-001',
      actorId: 'admin-001',
      decision: 'approve',
    });

    expect(result.decision).toBe('approve');
    expect(typeof result.activationToken).toBe('string');
    expect(/** @type {string} */ (result.activationToken).length).toBeGreaterThan(20);
  });

  it('activation token is not stored in plaintext (store receives hash)', async () => {
    let storedHash = '';
    activationTokenStore.createForUser.mockImplementation((data) => {
      storedHash = data.tokenHash;
      return Promise.resolve();
    });

    const result = await service.decideOrganization({
      orgId: 'org-001',
      actorId: 'admin-001',
      decision: 'approve',
    });

    // The stored hash must differ from the plaintext token
    expect(storedHash).not.toBe(result.activationToken);
    expect(storedHash).toHaveLength(64); // SHA-256 hex
  });

  it('creates a trial subscription with Starter plan by default', async () => {
    await service.decideOrganization({
      orgId: 'org-001',
      actorId: 'admin-001',
      decision: 'approve',
    });

    expect(subscriptionStore.createForOrg).toHaveBeenCalledOnce();
    const subArg = subscriptionStore.createForOrg.mock.calls[0]?.[0];
    expect(subArg?.status).toBe('trial');
    expect(subArg?.planCode).toBe('Starter');
  });

  it('activates org and owner membership atomically via transaction runner', async () => {
    await service.decideOrganization({
      orgId: 'org-001',
      actorId: 'admin-001',
      decision: 'approve',
    });

    expect(transactionRunner.run).toHaveBeenCalledOnce();
    expect(orgStore.activate).toHaveBeenCalledOnce();
    expect(membershipStore.activateOwner).toHaveBeenCalledOnce();
  });

  it('creates an audit event with actor, action, and resource', async () => {
    await service.decideOrganization({
      orgId: 'org-001',
      actorId: 'admin-001',
      decision: 'approve',
    });

    expect(auditWriter.appendBusinessEvent).toHaveBeenCalledOnce();
    const event = /** @type {Record<string, unknown>} */ (auditWriter.getEvents()[0]);
    expect(event?.['actorId']).toBe('admin-001');
    expect(event?.['action']).toBe('organization.activation_request.approved');
    expect(event?.['resourceId']).toBe('org-001');
  });

  it('throws CONFLICT when org is already active', async () => {
    const service2 = makeService({
      organizationStore: makeOrgStore({
        findById: vi.fn().mockResolvedValue({ _id: 'org-001', status: 'active' }),
      }),
    });

    await expect(
      service2.decideOrganization({ orgId: 'org-001', actorId: 'admin-001', decision: 'approve' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws CONFLICT when no pending Owner membership found during approval', async () => {
    const service2 = makeService({
      membershipStore: makeMembershipStore({
        activateOwner: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      service2.decideOrganization({ orgId: 'org-001', actorId: 'admin-001', decision: 'approve' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

// ---------------------------------------------------------------------------
// decideOrganization — reject
// ---------------------------------------------------------------------------

describe('platformOrgService — reject', () => {
  it('rejects a pending org with reason and creates audit event', async () => {
    const orgStore = makeOrgStore();
    const auditWriter = makeAuditWriter();
    const service = createPlatformOrgService({
      organizationStore: orgStore,
      membershipStore: makeMembershipStore(),
      activationTokenStore: makeActivationTokenStore(),
      subscriptionStore: makeSubscriptionStore(),
      auditWriter,
      transactionRunner: makeSyncTransactionRunner(),
    });

    const result = await service.decideOrganization({
      orgId: 'org-001',
      actorId: 'admin-001',
      decision: 'reject',
      reason: 'Incomplete documentation',
    });

    expect(result.decision).toBe('reject');
    expect(result.activationToken).toBeUndefined();
    expect(orgStore.reject).toHaveBeenCalledOnce();

    const event = /** @type {Record<string, unknown>} */ (auditWriter.getEvents()[0]);
    expect(event?.['action']).toBe('organization.activation_request.rejected');
    expect(event?.['reason']).toBe('Incomplete documentation');
  });

  it('does not issue an activation token when rejecting', async () => {
    const activationTokenStore = makeActivationTokenStore();
    const service = makeService({ activationTokenStore });

    const result = await service.decideOrganization({
      orgId: 'org-001',
      actorId: 'admin-001',
      decision: 'reject',
    });

    expect(result.activationToken).toBeUndefined();
    expect(activationTokenStore.createForUser).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_FAILED for invalid decision', async () => {
    await expect(
      makeService().decideOrganization({
        orgId: 'org-001',
        actorId: 'admin-001',
        // @ts-expect-error intentional invalid value
        decision: 'maybe',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('throws NOT_FOUND when org does not exist', async () => {
    const service = makeService({
      organizationStore: makeOrgStore({ findById: vi.fn().mockResolvedValue(null) }),
    });

    await expect(
      service.decideOrganization({ orgId: 'ghost', actorId: 'admin', decision: 'reject' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
