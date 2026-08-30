import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import setupProgressModule from '../settings/setup-progress.service';
import capabilityStoreModule from './capability.store';
import capabilityServiceModule from './capability.service';
import capabilityRegistryModule from './capability.registry';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createSetupProgressService } = setupProgressModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { listCapabilityControls } = capabilityRegistryModule;

const KEYS = [
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

function harness() {
  const auditStore = createInMemoryAuditEventStore();
  return {
    auditStore,
    service: createCapabilityService({
      store: createInMemoryCapabilityPolicyStore(),
      auditStore,
      transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
      resolveSubscriptionAccessState: async () => ({
        status: 'active',
        accessLevel: 'operational',
      }),
    }),
  };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

describe('Organization Setup capability controls', () => {
  it('registers exactly one module, eight presentation features, and refresh', () => {
    const controls = listCapabilityControls().filter((item) => item.moduleKey === 'setup');
    expect(controls.map((item) => item.key)).toEqual(KEYS);
    expect(controls[0]).toMatchObject({
      type: 'MODULE',
      parentKey: null,
      defaultPolicy: { enabled: true },
      configurable: { enabled: true },
      requiredPermissions: { enabled: 'settings.view' },
    });
    expect(controls.slice(1).every((item) => item.parentKey === 'setup')).toBe(true);
    expect(controls.slice(1, -1).every((item) => item.type === 'FEATURE')).toBe(true);
    expect(controls.at(-1)).toMatchObject({
      type: 'ACTION',
      defaultPolicy: { allowed: true },
      requiredPermissions: { allowed: 'settings.view' },
    });
    expect(controls.some((item) => item.key === 'setup.actions.openTask')).toBe(false);
  });

  it('resolves defaults, overrides, parent dependency, and RBAC intersection', async () => {
    const { service } = harness();
    const defaults = await service.resolveEffective('org-a', { permissions: ['settings.view'] });
    expect(control(defaults, 'setup.features.summary').effectiveValue.enabled).toBe(true);

    await service.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'setup', value: { enabled: false } }] },
      { actorId: 'admin' },
    );
    const restricted = await service.resolveEffective('org-a', {
      permissions: ['settings.view'],
    });
    for (const key of KEYS.slice(1)) {
      expect(Object.values(control(restricted, key).effectiveValue)).toEqual([false]);
      expect(control(restricted, key).reasons).toContain('parent_disabled');
    }

    const denied = await service.resolveEffective('org-b', { permissions: [] });
    expect(control(denied, 'setup').effectiveValue.enabled).toBe(false);
    expect(control(denied, 'setup').reasons).toContain('permission_denied');
  });

  it('isolates organizations and resets only Setup sparse overrides', async () => {
    const { service, auditStore } = harness();
    await service.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'setup.features.notes', value: { enabled: false } },
          { key: 'customers.features.search', value: { enabled: false } },
        ],
      },
      { actorId: 'admin' },
    );
    const orgB = await service.resolveEffective('org-b', { permissions: ['settings.view'] });
    expect(control(orgB, 'setup.features.notes').effectiveValue.enabled).toBe(true);

    const reset = await service.resetModule(
      'org-a',
      'setup',
      1,
      { actorId: 'admin' },
      'Reset Setup',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'setup.features.notes').override).toBeNull();
    expect(control(reset, 'customers.features.search').override).toEqual({ enabled: false });
    expect(auditStore.listForTest().at(-1).metadata.controlKey).toBe('setup.features.notes');
  });

  it('does not change completion facts or destination capabilities', async () => {
    const { service } = harness();
    const progress = createSetupProgressService({
      findOrganizationById: async () => ({ name: 'Tenant A' }),
      findSettingsByOrganizationId: async () => ({}),
      ...Object.fromEntries(
        [
          'countBranches',
          'countWarehouses',
          'countActiveMemberships',
          'countCategories',
          'countProducts',
          'countPackagingUnits',
          'countProductPrices',
          'countCustomers',
          'countSuppliers',
          'countAccounts',
          'countCustomersWithOpening',
          'countSuppliersWithOpening',
          'countAccountsWithOpening',
        ].map((name) => [name, async () => 1]),
      ),
    });
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
    const before = await progress.getSetupProgress('org-a', { permissions });
    await service.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'setup', value: { enabled: false } }] },
      { actorId: 'admin' },
    );
    const effective = await service.resolveEffective('org-a', { permissions });
    const after = await progress.getSetupProgress('org-a', { permissions });
    expect(after).toEqual(before);
    expect(control(effective, 'inventory.products').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'customers').effectiveValue.enabled).toBe(true);
  });
});
