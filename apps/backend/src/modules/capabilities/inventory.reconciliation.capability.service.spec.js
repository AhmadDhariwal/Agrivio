import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityStoreModule from './capability.store';
import capabilityServiceModule from './capability.service';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
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

describe('Inventory Reconciliation capability controls', () => {
  it('preserves current Inventory Reconciliation behavior when an organization has no override', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['inventory.view'],
    });

    expect(control(effective, 'inventory.reconciliation').effectiveValue.enabled).toBe(true);

    expect(
      control(effective, 'inventory.reconciliation.features.moduleInfo').effectiveValue.enabled,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.features.search').effectiveValue.enabled,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.features.warehouseFilter').effectiveValue.enabled,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.features.findingFilter').effectiveValue.enabled,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.features.kpiCards').effectiveValue.enabled,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.features.inspector').effectiveValue.enabled,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.features.technicalDetails').effectiveValue.enabled,
    ).toBe(true);

    expect(
      control(effective, 'inventory.reconciliation.fields.product').effectiveValue.visible,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.fields.warehouse').effectiveValue.visible,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.fields.batch').effectiveValue.visible,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.fields.balanceQuantity').effectiveValue.visible,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.fields.movementQuantity').effectiveValue.visible,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.fields.variance').effectiveValue.visible,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.fields.findingCode').effectiveValue.visible,
    ).toBe(true);

    expect(
      control(effective, 'inventory.reconciliation.actions.refresh').effectiveValue.allowed,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.actions.inspect').effectiveValue.allowed,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.actions.viewStock').effectiveValue.allowed,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.actions.viewMovements').effectiveValue.allowed,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.actions.viewBatch').effectiveValue.allowed,
    ).toBe(true);
  });

  it('rejects override attempts on all platform-enforced Reconciliation integrity fields', async () => {
    const { capabilityService } = createHarness();

    const integrityFields = [
      'product',
      'warehouse',
      'batch',
      'balanceQuantity',
      'movementQuantity',
      'variance',
      'findingCode',
    ];

    for (const field of integrityFields) {
      await expect(
        capabilityService.updatePolicy(
          'org-a',
          {
            expectedVersion: 0,
            changes: [
              { key: `inventory.reconciliation.fields.${field}`, value: { visible: false } },
            ],
          },
          { actorId: 'platform-admin' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('isolates Inventory Reconciliation module and optional presentation policy by organization', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.reconciliation', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await capabilityService.updatePolicy(
      'org-b',
      {
        expectedVersion: 0,
        changes: [
          { key: 'inventory.reconciliation.features.moduleInfo', value: { enabled: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const orgA = await capabilityService.resolveEffective('org-a');
    const orgB = await capabilityService.resolveEffective('org-b');

    expect(control(orgA, 'inventory.reconciliation').effectiveValue.enabled).toBe(false);
    expect(
      control(orgA, 'inventory.reconciliation.actions.inspect').effectiveValue.allowed,
    ).toBe(false);
    expect(control(orgB, 'inventory.reconciliation').effectiveValue.enabled).toBe(true);
    expect(
      control(orgB, 'inventory.reconciliation.features.moduleInfo').effectiveValue.enabled,
    ).toBe(false);
    expect(
      control(orgB, 'inventory.reconciliation.actions.inspect').effectiveValue.allowed,
    ).toBe(true);

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.reconciliation', 'enabled'),
    ).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
    await expect(
      capabilityService.assertAllowed('org-b', 'inventory.reconciliation', 'enabled'),
    ).resolves.toBeTruthy();
  });

  it('resets only Reconciliation overrides with audit and monotonic policy versions', async () => {
    const { capabilityService, auditStore } = createHarness();
    const updated = await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        reason: 'Limit reconciliation presentation',
        changes: [
          { key: 'inventory.reconciliation.features.moduleInfo', value: { enabled: false } },
          { key: 'inventory.reconciliation.features.kpiCards', value: { enabled: false } },
          { key: 'inventory.stock.fields.wac', value: { visible: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    expect(updated.version).toBe(1);

    const moduleReset = await capabilityService.resetModule(
      'org-a',
      'inventory.reconciliation',
      1,
      { actorId: 'platform-admin' },
      'Restore Reconciliation defaults',
    );
    expect(moduleReset.version).toBe(2);
    expect(
      control(moduleReset, 'inventory.reconciliation.features.moduleInfo').override,
    ).toBeNull();
    expect(
      control(moduleReset, 'inventory.reconciliation.features.kpiCards').override,
    ).toBeNull();
    expect(control(moduleReset, 'inventory.stock.fields.wac').override).toEqual({ visible: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      actorId: 'platform-admin',
      organizationId: 'org-a',
      metadata: {
        versionBefore: 1,
        versionAfter: 2,
        previousOverride: { enabled: false },
        newOverride: null,
      },
    });
  });

  it('rejects resetModule for unknown module keys', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.resetModule(
        'org-a',
        'inventory.unknownModule',
        0,
        { actorId: 'platform-admin' },
        'Unknown module reset',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('blocks Reconciliation cross-module actions when their target module is unavailable', async () => {
    const { capabilityService } = createHarness();

    // 1. When only inventory.stock is disabled: viewStock is disabled, viewBatch remains allowed
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.stock', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    let effective = await capabilityService.resolveEffective('org-a');
    expect(control(effective, 'inventory.reconciliation').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'inventory.reconciliation.actions.viewStock')).toMatchObject({
      effectiveValue: { allowed: false },
      reasons: ['dependency_disabled'],
    });
    expect(
      control(effective, 'inventory.reconciliation.actions.viewBatch').effectiveValue.allowed,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.actions.viewMovements').effectiveValue.allowed,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.actions.refresh').effectiveValue.allowed,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.actions.inspect').effectiveValue.allowed,
    ).toBe(true);

    // 2. When inventory.batches is also disabled: both viewStock and viewBatch are disabled
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 1,
        changes: [{ key: 'inventory.batches', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    effective = await capabilityService.resolveEffective('org-a');
    expect(control(effective, 'inventory.reconciliation').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'inventory.reconciliation.actions.viewStock')).toMatchObject({
      effectiveValue: { allowed: false },
      reasons: ['dependency_disabled'],
    });
    expect(control(effective, 'inventory.reconciliation.actions.viewBatch')).toMatchObject({
      effectiveValue: { allowed: false },
      reasons: ['dependency_disabled'],
    });
    expect(
      control(effective, 'inventory.reconciliation.actions.viewMovements').effectiveValue.allowed,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.actions.refresh').effectiveValue.allowed,
    ).toBe(true);
    expect(
      control(effective, 'inventory.reconciliation.actions.inspect').effectiveValue.allowed,
    ).toBe(true);
  });
});
