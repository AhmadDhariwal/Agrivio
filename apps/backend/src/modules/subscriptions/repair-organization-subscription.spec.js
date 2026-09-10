import { describe, expect, it } from 'vitest';
import repairModule from './subscription-repair';

const { determineRepairLifecycle, parseRepairArguments, repairOrganizationSubscription } =
  repairModule;

function createStore(organization, initialSubscription = null) {
  let subscription = initialSubscription;
  const audit = [];
  let insertCount = 0;
  return {
    store: {
      findOrganizationById: async (id) => (id === String(organization._id) ? organization : null),
      findSubscriptionByOrganizationId: async () => subscription,
      findActiveStarterPlan: async () => ({
        _id: 'plan-1',
        planCode: 'Starter',
        planVersion: 3,
        status: 'active',
      }),
      runInTransaction: async (work) => work({ id: 'session-1' }),
      insertSubscription: async (_session, doc) => {
        insertCount += 1;
        subscription = { _id: 'subscription-1', ...doc };
        return subscription;
      },
      appendAuditEvent: async (_session, event) => audit.push(event),
    },
    get insertCount() {
      return insertCount;
    },
    audit,
  };
}

describe('repair organization subscription CLI', () => {
  it('requires an organization id and parses dry-run safely', () => {
    expect(() => parseRepairArguments([])).toThrow('--organization-id');
    expect(parseRepairArguments(['--organization-id', 'org-1', '--dry-run'])).toEqual({
      organizationId: 'org-1',
      dryRun: true,
    });
  });

  it('derives trial, grace, and suspension from the original approval instant', () => {
    const organization = {
      status: 'approved',
      approvedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    expect(
      determineRepairLifecycle(organization, new Date('2026-01-10T00:00:00.000Z')).status,
    ).toBe('trial');
    expect(
      determineRepairLifecycle(organization, new Date('2026-01-18T00:00:00.000Z')).status,
    ).toBe('grace');
    expect(
      determineRepairLifecycle(organization, new Date('2026-02-01T00:00:00.000Z')).status,
    ).toBe('suspended');
  });

  it('performs no mutation during dry-run', async () => {
    const harness = createStore({ _id: 'org-1', status: 'pending_approval' });
    const result = await repairOrganizationSubscription({
      organizationId: 'org-1',
      dryRun: true,
      store: harness.store,
    });
    expect(result).toMatchObject({
      targetSubscriptionStatus: 'pending_approval',
      changeWouldOccur: true,
      changed: false,
    });
    expect(harness.insertCount).toBe(0);
    expect(harness.audit).toHaveLength(0);
  });

  it('repairs pending and approved organizations with the authoritative Starter plan', async () => {
    const cases = [
      {
        organization: { _id: 'pending-org', status: 'pending_approval' },
        now: new Date('2026-01-01T00:00:00.000Z'),
        expected: 'pending_approval',
      },
      {
        organization: {
          _id: 'approved-org',
          status: 'approved',
          approvedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        now: new Date('2026-01-10T00:00:00.000Z'),
        expected: 'trial',
      },
    ];
    for (const item of cases) {
      const harness = createStore(item.organization);
      const result = await repairOrganizationSubscription({
        organizationId: String(item.organization._id),
        dryRun: false,
        now: item.now,
        store: harness.store,
      });
      expect(result).toMatchObject({
        selectedPlanCode: 'Starter',
        selectedPlanVersion: 3,
        targetSubscriptionStatus: item.expected,
        changed: true,
      });
      expect(harness.insertCount).toBe(1);
      expect(harness.audit).toHaveLength(1);
    }
  });

  it('never overwrites an existing subscription and is idempotent', async () => {
    const existing = {
      _id: 'subscription-existing',
      status: 'active',
      planCode: 'Business',
      planVersion: 2,
    };
    const harness = createStore({ _id: 'org-1', status: 'approved' }, existing);
    const first = await repairOrganizationSubscription({
      organizationId: 'org-1',
      dryRun: false,
      store: harness.store,
    });
    const second = await repairOrganizationSubscription({
      organizationId: 'org-1',
      dryRun: false,
      store: harness.store,
    });
    expect(first.changed).toBe(false);
    expect(second.changed).toBe(false);
    expect(harness.insertCount).toBe(0);
  });

  it('fails safely for invalid or ineligible organizations', async () => {
    const harness = createStore({ _id: 'org-1', status: 'rejected' });
    await expect(
      repairOrganizationSubscription({
        organizationId: 'invalid',
        dryRun: true,
        store: harness.store,
      }),
    ).rejects.toThrow('Organization not found');
    await expect(
      repairOrganizationSubscription({
        organizationId: 'org-1',
        dryRun: true,
        store: harness.store,
      }),
    ).rejects.toThrow('not eligible');
  });
});
