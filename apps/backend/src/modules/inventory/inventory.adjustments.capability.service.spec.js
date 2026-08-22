import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityStoreModule from '../../modules/capabilities/capability.store';
import capabilityServiceModule from '../../modules/capabilities/capability.service';
import capabilityRegistryModule from '../../modules/capabilities/capability.registry';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { listCapabilityControls, getCapabilityControl, ADJUSTMENTS_MODULE_KEY } =
  capabilityRegistryModule;

function createHarness() {
  const store = createInMemoryCapabilityPolicyStore();
  const auditStore = createInMemoryAuditEventStore();
  const capabilityService = createCapabilityService({
    store,
    auditStore,
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => ({ status: 'active', accessLevel: 'operational' }),
  });
  return { capabilityService, store, auditStore };
}

function ctrl(result, key) {
  return result.controls.find((item) => item.key === key);
}

describe('Stock Adjustments capability registry', () => {
  it('exports the correct module key constant', () => {
    expect(ADJUSTMENTS_MODULE_KEY).toBe('inventory.adjustments');
  });

  it('registers exactly 20 inventory.adjustments.* controls', () => {
    const all = listCapabilityControls();
    const adjustments = all.filter((c) => c.moduleKey === ADJUSTMENTS_MODULE_KEY);
    expect(adjustments).toHaveLength(20);
  });

  it('registers the root module with correct type, default, risk, and configurable', () => {
    const def = getCapabilityControl('inventory.adjustments');
    expect(def).not.toBeNull();
    expect(def.type).toBe('MODULE');
    expect(def.risk).toBe('CRITICAL');
    expect(def.defaultPolicy).toEqual({ enabled: true });
    expect(def.configurable).toEqual({ enabled: true });
    expect(def.parentKey).toBe('inventory');
  });

  it('registers all 7 presentation features as configurable', () => {
    const featureIds = [
      'moduleInfo',
      'productSearch',
      'productContext',
      'stockContext',
      'guidance',
      'recentAdjustments',
      'serverPostingDate',
    ];
    for (const id of featureIds) {
      const def = getCapabilityControl(`inventory.adjustments.features.${id}`);
      expect(def, `feature ${id} must exist`).not.toBeNull();
      expect(def.type).toBe('FEATURE');
      expect(def.defaultPolicy.enabled).toBe(true);
      expect(def.configurable.enabled).toBe(true);
    }
  });

  it('registers all 8 workflow fields as platform-enforced and non-configurable', () => {
    const fieldIds = [
      'warehouse',
      'product',
      'adjustmentType',
      'quantity',
      'reason',
      'batch',
      'direction',
      'inventoryValue',
    ];
    for (const id of fieldIds) {
      const def = getCapabilityControl(`inventory.adjustments.fields.${id}`);
      expect(def, `field ${id} must exist`).not.toBeNull();
      expect(def.type).toBe('FIELD');
      expect(def.platformEnforced).toBe(true);
      expect(def.configurable.visible).toBe(false);
      expect(def.defaultPolicy.visible).toBe(true);
      expect(def.risk).toBe('CRITICAL');
    }
  });

  it('registers all 4 actions with correct defaults and risk levels', () => {
    const postDef = getCapabilityControl('inventory.adjustments.actions.post');
    expect(postDef).not.toBeNull();
    expect(postDef.type).toBe('ACTION');
    expect(postDef.defaultPolicy.allowed).toBe(true);
    expect(postDef.configurable.allowed).toBe(true);
    expect(postDef.risk).toBe('CRITICAL');
    expect(postDef.requiredPermissions.allowed).toBe('inventory.adjust');

    const reverseDef = getCapabilityControl('inventory.adjustments.actions.reverse');
    expect(reverseDef).not.toBeNull();
    expect(reverseDef.risk).toBe('CRITICAL');
    expect(reverseDef.requiredPermissions.allowed).toBe('inventory.adjust.reverse');

    const viewStockDef = getCapabilityControl('inventory.adjustments.actions.viewStock');
    expect(viewStockDef).not.toBeNull();
    expect(viewStockDef.risk).toBe('NORMAL');
    expect(viewStockDef.dependencies).toEqual(['inventory.stock']);

    const viewMovementsDef = getCapabilityControl('inventory.adjustments.actions.viewMovements');
    expect(viewMovementsDef).not.toBeNull();
    expect(viewMovementsDef.risk).toBe('NORMAL');
    expect(viewMovementsDef.dependencies).toBeUndefined();
  });

  it('rejects override attempts on all 8 platform-enforced workflow fields', async () => {
    const { capabilityService } = createHarness();
    const fieldIds = [
      'warehouse',
      'product',
      'adjustmentType',
      'quantity',
      'reason',
      'batch',
      'direction',
      'inventoryValue',
    ];
    for (const id of fieldIds) {
      await expect(
        capabilityService.updatePolicy(
          'org-a',
          {
            expectedVersion: 0,
            changes: [
              { key: `inventory.adjustments.fields.${id}`, value: { visible: false } },
            ],
          },
          { actorId: 'platform-admin' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('rejects unknown inventory.adjustments.* keys', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'inventory.adjustments.features.nonExistent', value: { enabled: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('does not register inventory.negative-stock.override as a capability key', () => {
    const def = getCapabilityControl('inventory.negative-stock.override');
    expect(def).toBeNull();
    const all = listCapabilityControls();
    const negativeStockKeys = all.filter((c) => c.key.includes('negative-stock'));
    expect(negativeStockKeys).toHaveLength(0);
  });
});

describe('Stock Adjustments capability service controls', () => {
  it('resolves all inventory.adjustments.* as enabled/allowed by default', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['inventory.view', 'inventory.adjust', 'inventory.adjust.reverse'],
    });

    expect(ctrl(effective, 'inventory.adjustments').effectiveValue.enabled).toBe(true);
    for (const id of [
      'moduleInfo',
      'productSearch',
      'productContext',
      'stockContext',
      'guidance',
      'recentAdjustments',
      'serverPostingDate',
    ]) {
      expect(
        ctrl(effective, `inventory.adjustments.features.${id}`).effectiveValue.enabled,
        `feature ${id}`,
      ).toBe(true);
    }
    for (const id of [
      'warehouse',
      'product',
      'adjustmentType',
      'quantity',
      'reason',
      'batch',
      'direction',
      'inventoryValue',
    ]) {
      expect(
        ctrl(effective, `inventory.adjustments.fields.${id}`).effectiveValue.visible,
        `field ${id}`,
      ).toBe(true);
    }
    expect(ctrl(effective, 'inventory.adjustments.actions.post').effectiveValue.allowed).toBe(true);
    expect(
      ctrl(effective, 'inventory.adjustments.actions.reverse').effectiveValue.allowed,
    ).toBe(true);
    expect(
      ctrl(effective, 'inventory.adjustments.actions.viewStock').effectiveValue.allowed,
    ).toBe(true);
    expect(
      ctrl(effective, 'inventory.adjustments.actions.viewMovements').effectiveValue.allowed,
    ).toBe(true);
  });

  it('assertAllowed rejects ORG_CAPABILITY_DISABLED when module is disabled for org-a', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.adjustments', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.adjustments', 'enabled'),
    ).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
  });

  it('org-b remains unaffected when org-a disables the module', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.adjustments', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-b', 'inventory.adjustments', 'enabled'),
    ).resolves.toBeTruthy();
  });

  it('disabling Post action rejects ORG_ACTION_NOT_ALLOWED for that key', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.adjustments.actions.post', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.adjustments.actions.post', 'allowed'),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.adjustments', 'enabled'),
    ).resolves.toBeTruthy();
  });

  it('disabling Reverse action rejects ORG_ACTION_NOT_ALLOWED while keeping module enabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.adjustments.actions.reverse', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.adjustments.actions.reverse', 'allowed'),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.adjustments', 'enabled'),
    ).resolves.toBeTruthy();
  });

  it('viewStock is blocked by dependency when inventory.stock is disabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.stock', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    const effective = await capabilityService.resolveEffective('org-a');
    expect(ctrl(effective, 'inventory.adjustments.actions.viewStock')).toMatchObject({
      effectiveValue: { allowed: false },
      reasons: ['dependency_disabled'],
    });
    expect(
      ctrl(effective, 'inventory.adjustments.actions.viewMovements').effectiveValue.allowed,
    ).toBe(true);
  });

  it('resetModule removes only inventory.adjustments.* overrides with audit and version increment', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        reason: 'Limit Adjustments',
        changes: [
          { key: 'inventory.adjustments', value: { enabled: false } },
          { key: 'inventory.adjustments.actions.post', value: { allowed: false } },
          { key: 'inventory.stock.fields.wac', value: { visible: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    expect(
      (await capabilityService.resolveEffective('org-a')).version,
    ).toBe(1);

    const moduleReset = await capabilityService.resetModule(
      'org-a',
      'inventory.adjustments',
      1,
      { actorId: 'platform-admin' },
      'Restore Adjustment defaults',
    );

    expect(moduleReset.version).toBe(2);
    expect(ctrl(moduleReset, 'inventory.adjustments').override).toBeNull();
    expect(ctrl(moduleReset, 'inventory.adjustments').effectiveValue.enabled).toBe(true);
    expect(ctrl(moduleReset, 'inventory.adjustments.actions.post').override).toBeNull();
    expect(ctrl(moduleReset, 'inventory.adjustments.actions.post').effectiveValue.allowed).toBe(
      true,
    );
    expect(ctrl(moduleReset, 'inventory.stock.fields.wac').override).toEqual({ visible: false });

    const auditEvents = auditStore.listForTest();
    const adjustmentAuditEvents = auditEvents.filter(
      (e) =>
        e.organizationId === 'org-a' &&
        typeof e.metadata?.controlKey === 'string' &&
        e.metadata.controlKey.startsWith('inventory.adjustments'),
    );
    expect(adjustmentAuditEvents.length).toBeGreaterThanOrEqual(2);
    expect(auditEvents.at(-1)).toMatchObject({
      actorId: 'platform-admin',
      organizationId: 'org-a',
      metadata: { versionBefore: 1, versionAfter: 2, newOverride: null },
    });
  });

  it('resetModule for inventory.adjustments does not affect org-b', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.adjustments', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await capabilityService.updatePolicy(
      'org-b',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.adjustments.actions.post', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await capabilityService.resetModule(
      'org-a',
      'inventory.adjustments',
      1,
      { actorId: 'platform-admin' },
    );

    const orgB = await capabilityService.resolveEffective('org-b');
    expect(ctrl(orgB, 'inventory.adjustments.actions.post').override).toEqual({ allowed: false });
    expect(ctrl(orgB, 'inventory.adjustments.actions.post').effectiveValue.allowed).toBe(false);
  });

  it('resetModule rejects an unknown module key', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.resetModule('org-a', 'inventory.adjustments.nonexistent', 0, {
        actorId: 'platform-admin',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('individual resetOverride removes one inventory.adjustments override and increments version', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'inventory.adjustments.actions.post', value: { allowed: false } },
          { key: 'inventory.adjustments.actions.reverse', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const afterReset = await capabilityService.resetOverride(
      'org-a',
      'inventory.adjustments.actions.post',
      1,
      { actorId: 'platform-admin' },
      'Re-enable posting',
    );

    expect(afterReset.version).toBe(2);
    expect(ctrl(afterReset, 'inventory.adjustments.actions.post').override).toBeNull();
    expect(ctrl(afterReset, 'inventory.adjustments.actions.reverse').override).toEqual({
      allowed: false,
    });
  });
});
