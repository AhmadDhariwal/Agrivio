import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import setupProgressModule from '../settings/setup-progress.service';
import capabilityStoreModule from './capability.store';
import capabilityServiceModule from './capability.service';
import capabilityRegistryModule from './capability.registry';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { listCapabilityControls } = capabilityRegistryModule;
const { createSetupProgressService } = setupProgressModule;

const SETUP_KEYS = [
  'setup',
  'setup.features.moduleInfo',
  'setup.features.summary',
  'setup.features.subscriptionNotice',
  'setup.features.search',
  'setup.features.statusFilter',
  'setup.features.taskList',
  'setup.features.operationalReadiness',
  'setup.features.notes',
  'setup.actions.refresh',
];

function createHarness() {
  const store = createInMemoryCapabilityPolicyStore();
  const auditStore = createInMemoryAuditEventStore();
  const capabilityService = createCapabilityService({
    store,
    auditStore,
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => ({
      status: 'active',
      accessLevel: 'operational',
    }),
  });
  return { capabilityService, auditStore };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

function createProgressService() {
  return createSetupProgressService({
    findOrganizationById: async () => ({ name: 'Tenant A' }),
    findSettingsByOrganizationId: async () => ({ id: 'settings-a' }),
    countBranches: async () => 1,
    countWarehouses: async () => 1,
    countActiveMemberships: async () => 1,
    countCategories: async () => 1,
    countProducts: async () => 1,
    countPackagingUnits: async () => 1,
    countProductPrices: async () => 1,
    countCustomers: async () => 0,
    countSuppliers: async () => 0,
    countAccounts: async () => 0,
    countCustomersWithOpening: async () => 0,
    countSuppliersWithOpening: async () => 0,
    countAccountsWithOpening: async () => 0,
  });
}

describe('Organization Setup capability controls', () => {
  it('registers the exact source-backed controls and presentation classification', () => {
    const controls = listCapabilityControls().filter((item) => item.moduleKey === 'setup');

    expect(controls.map((item) => item.key)).toEqual(SETUP_KEYS);
    expect(controls[0]).toMatchObject({
      key: 'setup',
      type: 'MODULE',
      parentKey: null,
      defaultPolicy: { enabled: true },
      configurable: { enabled: true },
      requiredPermissions: { enabled: 'settings.view' },
    });
    expect(controls.slice(1, -1).every((item) => item.type === 'FEATURE')).toBe(true);
    expect(controls.slice(1).every((item) => item.parentKey === 'setup')).toBe(true);
    expect(controls.at(-1)).toMatchObject({
      key: 'setup.actions.refresh',
      type: 'ACTION',
      defaultPolicy: { allowed: true },
      configurable: { allowed: true },
      requiredPermissions: { allowed: 'settings.view' },
    });
    expect(controls.some((item) => item.key === 'setup.actions.openTask')).toBe(false);
  });

  it('resolves defaults, sparse overrides, and direct module-parent restrictions', async () => {
    const { capabilityService } = createHarness();
    const defaults = await capabilityService.resolveEffective('org-a', {
      permissions: ['settings.view'],
    });
    expect(control(defaults, 'setup.features.summary')).toMatchObject({
      override: null,
      configuredValue: { enabled: true },
      effectiveValue: { enabled: true },
    });

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'setup', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const restricted = await capabilityService.resolveEffective('org-a', {
      permissions: ['settings.view'],
    });
    for (const key of SETUP_KEYS.slice(1)) {
      expect(Object.values(control(restricted, key).effectiveValue)).toEqual([false]);
      expect(control(restricted, key).reasons).toContain('parent_disabled');
    }
  });

  it('keeps settings.view RBAC authoritative while controls default on', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', { permissions: [] });

    for (const key of SETUP_KEYS) {
      expect(Object.values(control(effective, key).effectiveValue)).toEqual([false]);
      expect(control(effective, key).reasons).toContain('permission_denied');
    }
  });

  it('isolates organizations and resets only Setup sparse overrides with audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'setup.features.notes', value: { enabled: false } },
          { key: 'customers.features.search', value: { enabled: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const orgB = await capabilityService.resolveEffective('org-b', {
      permissions: ['settings.view'],
    });
    expect(control(orgB, 'setup.features.notes').effectiveValue.enabled).toBe(true);

    const reset = await capabilityService.resetModule(
      'org-a',
      'setup',
      1,
      { actorId: 'platform-admin' },
      'Restore Setup defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'setup.features.notes').override).toBeNull();
    expect(control(reset, 'customers.features.search').override).toEqual({ enabled: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: {
        controlKey: 'setup.features.notes',
        versionBefore: 1,
        versionAfter: 2,
      },
    });
  });

  it('does not alter Setup completion facts or destination capabilities', async () => {
    const { capabilityService } = createHarness();
    const progressService = createProgressService();
    const permissions = [
      'settings.view',
      'branches.view',
      'warehouses.view',
      'users.view',
      'catalog.view',
      'customers.view',
      'suppliers.view',
      'accounts.view',
    ];
    const before = await progressService.getSetupProgress('org-a', { permissions });

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'setup', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: [...permissions, 'catalog.view', 'customers.view'],
    });
    const after = await progressService.getSetupProgress('org-a', { permissions });

    expect(after).toEqual(before);
    expect(control(effective, 'inventory.products').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers').effectiveValue.enabled).toBe(true);
  });
});
