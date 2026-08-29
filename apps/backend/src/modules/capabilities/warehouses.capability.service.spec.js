import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityStoreModule from './capability.store';
import capabilityServiceModule from './capability.service';
import capabilityRegistryModule from './capability.registry';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { listCapabilityControls } = capabilityRegistryModule;

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

const WAREHOUSE_KEYS = [
  'warehouses',
  'warehouses.features.moduleInfo',
  'warehouses.features.search',
  'warehouses.features.statusFilter',
  'warehouses.fields.name',
  'warehouses.fields.code',
  'warehouses.fields.status',
  'warehouses.actions.create',
  'warehouses.actions.edit',
  'warehouses.actions.deactivate',
  'warehouses.actions.reactivate',
  'warehouses.actions.delete',
  'warehouses.actions.refresh',
];

describe('Warehouses capability controls', () => {
  it('registers the exact source-backed controls and safety classifications', () => {
    const controls = listCapabilityControls().filter((item) => item.moduleKey === 'warehouses');
    expect(controls.map((item) => item.key)).toEqual(WAREHOUSE_KEYS);

    expect(controls.find((item) => item.key === 'warehouses.fields.name')).toMatchObject({
      defaultPolicy: { visible: true, editable: true },
      configurable: { visible: false, editable: false },
      platformEnforced: true,
    });
    expect(controls.find((item) => item.key === 'warehouses.fields.code')).toMatchObject({
      configurable: { visible: true, editable: true },
    });
    expect(controls.find((item) => item.key === 'warehouses.fields.status')).toMatchObject({
      defaultPolicy: { visible: true, editable: false },
      configurable: { visible: false, editable: false },
      platformEnforced: true,
    });
  });

  it('resolves Default, Override, Effective and applies the module parent restriction', async () => {
    const { capabilityService } = createHarness();
    const defaults = await capabilityService.resolveEffective('org-a', {
      permissions: ['warehouses.view', 'warehouses.manage'],
    });
    expect(control(defaults, 'warehouses.actions.create')).toMatchObject({
      override: null,
      configuredValue: { allowed: true },
      effectiveValue: { allowed: true },
    });

    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'warehouses', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    const restricted = await capabilityService.resolveEffective('org-a', {
      permissions: ['warehouses.view', 'warehouses.manage'],
    });
    expect(control(restricted, 'warehouses')).toMatchObject({
      override: { enabled: false },
      configuredValue: { enabled: false },
      effectiveValue: { enabled: false },
    });
    expect(control(restricted, 'warehouses.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(restricted, 'warehouses.actions.create').reasons).toContain('parent_disabled');
  });

  it('keeps RBAC authoritative when organization controls are enabled', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['warehouses.view'],
    });

    expect(control(effective, 'warehouses').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'warehouses.actions.refresh').effectiveValue.allowed).toBe(true);
    expect(control(effective, 'warehouses.actions.create').effectiveValue.allowed).toBe(false);
    expect(control(effective, 'warehouses.actions.create').reasons).toContain('permission_denied');
  });

  it('enforces edit, optional Code editability, and lifecycle actions independently', async () => {
    const editHarness = createHarness();
    await editHarness.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'warehouses.actions.edit', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await expect(
      editHarness.capabilityService.assertWarehousePatchAllowed(
        'org-a',
        { name: 'Main', code: 'MAIN', status: 'active' },
        { name: 'Central' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    const codeHarness = createHarness();
    await codeHarness.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'warehouses.fields.code', value: { editable: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await expect(
      codeHarness.capabilityService.assertWarehousePatchAllowed(
        'org-a',
        { name: 'Main', code: 'MAIN', status: 'active' },
        { code: 'CRAFTED' },
      ),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });

    for (const [action, currentStatus, nextStatus] of [
      ['deactivate', 'active', 'inactive'],
      ['reactivate', 'inactive', 'active'],
    ]) {
      const lifecycleHarness = createHarness();
      await lifecycleHarness.capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: `warehouses.actions.${action}`, value: { allowed: false } }],
        },
        { actorId: 'platform-admin' },
      );
      await expect(
        lifecycleHarness.capabilityService.assertWarehousePatchAllowed(
          'org-a',
          { name: 'Main', code: '', status: currentStatus },
          { status: nextStatus },
        ),
      ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
    }
  });

  it('isolates organizations and resets only Warehouse sparse overrides with audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'warehouses.actions.delete', value: { allowed: false } },
          { key: 'customers.features.search', value: { enabled: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const orgB = await capabilityService.resolveEffective('org-b');
    expect(control(orgB, 'warehouses.actions.delete').effectiveValue.allowed).toBe(true);

    const reset = await capabilityService.resetModule(
      'org-a',
      'warehouses',
      1,
      { actorId: 'platform-admin' },
      'Restore Warehouse defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'warehouses.actions.delete').override).toBeNull();
    expect(control(reset, 'customers.features.search').override).toEqual({ enabled: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: {
        controlKey: 'warehouses.actions.delete',
        versionBefore: 1,
        versionAfter: 2,
      },
    });
  });
});
