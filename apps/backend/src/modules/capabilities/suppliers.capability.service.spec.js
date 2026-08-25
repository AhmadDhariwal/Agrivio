import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityRegistryModule from './capability.registry';
import capabilityStoreModule from './capability.store';
import capabilityServiceModule from './capability.service';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { listCapabilityControls } = capabilityRegistryModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;

function createHarness(options = {}) {
  const store = createInMemoryCapabilityPolicyStore();
  const auditStore = createInMemoryAuditEventStore();
  const capabilityService = createCapabilityService({
    store,
    auditStore,
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState:
      options.resolveSubscriptionAccessState ??
      (async () => ({ status: 'active', accessLevel: 'operational' })),
  });
  return { capabilityService, store, auditStore };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

const supplierKeys = [
  'suppliers',
  'suppliers.features.moduleInfo',
  'suppliers.features.search',
  'suppliers.features.statusFilter',
  'suppliers.features.kpiCards',
  'suppliers.features.inspector',
  'suppliers.features.technicalDetails',
  'suppliers.fields.name',
  'suppliers.fields.contactName',
  'suppliers.fields.phone',
  'suppliers.fields.email',
  'suppliers.fields.derivedBalances',
  'suppliers.fields.openingBalance',
  'suppliers.actions.create',
  'suppliers.actions.inspect',
  'suppliers.actions.edit',
  'suppliers.actions.deactivate',
  'suppliers.actions.reactivate',
  'suppliers.actions.delete',
  'suppliers.actions.postOpeningBalance',
  'suppliers.actions.refresh',
];

describe('Suppliers capability controls', () => {
  it('registers the exact authoritative Suppliers control set without a desktop Cards view', () => {
    expect(
      listCapabilityControls()
        .filter((item) => item.moduleKey === 'suppliers')
        .map((item) => item.key),
    ).toEqual(supplierKeys);
  });

  it('preserves current Suppliers behavior when no policy document exists', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['suppliers.view', 'suppliers.manage', 'suppliers.opening-balance.post'],
    });

    expect(effective.controls.filter((item) => item.moduleKey === 'suppliers')).toHaveLength(21);
    expect(control(effective, 'suppliers').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'suppliers.fields.name').effectiveValue).toEqual({
      visible: true,
      editable: true,
    });
    expect(control(effective, 'suppliers.fields.phone').effectiveValue).toEqual({
      visible: true,
      editable: true,
    });
    expect(control(effective, 'suppliers.actions.postOpeningBalance').effectiveValue.allowed).toBe(
      true,
    );
  });

  it('blocks all Suppliers controls when the module is disabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'suppliers', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['suppliers.view', 'suppliers.manage', 'suppliers.opening-balance.post'],
    });

    expect(control(effective, 'suppliers').effectiveValue.enabled).toBe(false);
    expect(control(effective, 'suppliers.features.search').effectiveValue.enabled).toBe(false);
    expect(control(effective, 'suppliers.fields.phone').effectiveValue.editable).toBe(false);
    expect(control(effective, 'suppliers.actions.create').effectiveValue.allowed).toBe(false);
    await expect(
      capabilityService.assertAllowed('org-a', 'suppliers', 'enabled'),
    ).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
  });

  it.each([
    'suppliers.fields.name',
    'suppliers.fields.derivedBalances',
    'suppliers.fields.openingBalance',
  ])('rejects visibility overrides for platform-enforced field %s', async (key) => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        { expectedVersion: 0, changes: [{ key, value: { visible: false } }] },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('enforces configurable field editability on backend supplier mutations', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'suppliers.fields.phone', value: { visible: true, editable: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertSupplierPatchAllowed(
        'org-a',
        { phone: '03001234567', status: 'active' },
        { phone: '03007654321' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });
  });

  it('requires Edit plus the matching lifecycle action for status transitions', async () => {
    const deactivateHarness = createHarness();
    await deactivateHarness.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'suppliers.actions.deactivate', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await expect(
      deactivateHarness.capabilityService.assertSupplierPatchAllowed(
        'org-a',
        { status: 'active' },
        { status: 'inactive' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    const reactivateHarness = createHarness();
    await reactivateHarness.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'suppliers.actions.reactivate', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await expect(
      reactivateHarness.capabilityService.assertSupplierPatchAllowed(
        'org-a',
        { status: 'inactive' },
        { status: 'active' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
  });

  it('enforces Create, Edit, Delete, and Post Opening Balance independently', async () => {
    for (const [key, assertion] of [
      ['suppliers.actions.create', 'assertSupplierCreateAllowed'],
      ['suppliers.actions.edit', 'assertSupplierPatchAllowed'],
      ['suppliers.actions.delete', 'assertSupplierDeleteAllowed'],
      ['suppliers.actions.postOpeningBalance', 'assertSupplierOpeningBalanceAllowed'],
    ]) {
      const { capabilityService } = createHarness();
      await capabilityService.updatePolicy(
        'org-a',
        { expectedVersion: 0, changes: [{ key, value: { allowed: false } }] },
        { actorId: 'platform-admin' },
      );
      const args =
        assertion === 'assertSupplierPatchAllowed'
          ? ['org-a', { name: 'Old', status: 'active' }, { name: 'New' }]
          : ['org-a'];
      await expect(capabilityService[assertion](...args)).rejects.toMatchObject({
        code: 'ORG_ACTION_NOT_ALLOWED',
      });
    }
  });

  it('keeps RBAC authoritative and never grants missing Supplier permissions', async () => {
    const { capabilityService } = createHarness();
    const viewOnly = await capabilityService.resolveEffective('org-a', {
      permissions: ['suppliers.view'],
    });
    expect(control(viewOnly, 'suppliers').effectiveValue.enabled).toBe(true);
    expect(control(viewOnly, 'suppliers.actions.inspect').effectiveValue.allowed).toBe(true);
    expect(control(viewOnly, 'suppliers.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(viewOnly, 'suppliers.actions.postOpeningBalance').effectiveValue.allowed).toBe(
      false,
    );

    const noPermissions = await capabilityService.resolveEffective('org-a', { permissions: [] });
    expect(control(noPermissions, 'suppliers').effectiveValue.enabled).toBe(false);
    expect(control(noPermissions, 'suppliers').reasons).toContain('permission_denied');
  });

  it('isolates organizations and resets only Suppliers overrides with audit/version evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        reason: 'Restrict Suppliers',
        changes: [
          { key: 'suppliers.actions.delete', value: { allowed: false } },
          { key: 'inventory.stock.fields.wac', value: { visible: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    expect(
      control(await capabilityService.resolveEffective('org-b'), 'suppliers.actions.delete')
        .effectiveValue.allowed,
    ).toBe(true);
    const reset = await capabilityService.resetModule(
      'org-a',
      'suppliers',
      1,
      { actorId: 'platform-admin' },
      'Restore Supplier defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'suppliers.actions.delete').override).toBeNull();
    expect(control(reset, 'inventory.stock.fields.wac').override).toEqual({ visible: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });

  it('blocks subscription-unavailable organizations from using Suppliers', async () => {
    const { capabilityService } = createHarness({
      resolveSubscriptionAccessState: async () => ({
        status: 'suspended',
        accessLevel: 'read_only',
      }),
    });
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['suppliers.view', 'suppliers.manage'],
    });
    expect(control(effective, 'suppliers').effectiveValue.enabled).toBe(false);
    expect(control(effective, 'suppliers').reasons).toContain('subscription_unavailable');
  });
});
