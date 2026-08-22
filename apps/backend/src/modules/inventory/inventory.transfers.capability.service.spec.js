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
const { listCapabilityControls, getCapabilityControl, TRANSFERS_MODULE_KEY } =
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

// ── Registry ─────────────────────────────────────────────────────────────────

describe('Warehouse Transfers capability registry', () => {
  it('exports the correct module key constant', () => {
    expect(TRANSFERS_MODULE_KEY).toBe('inventory.transfers');
  });

  it('registers exactly 18 inventory.transfers.* controls', () => {
    const all = listCapabilityControls();
    const transfers = all.filter((c) => c.moduleKey === TRANSFERS_MODULE_KEY);
    expect(transfers).toHaveLength(18);
  });

  it('registers the root MODULE with enabled default, CRITICAL risk, and configurable enabled', () => {
    const def = getCapabilityControl('inventory.transfers');
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
      'recentTransfers',
      'serverTransferDate',
    ];
    for (const id of featureIds) {
      const def = getCapabilityControl(`inventory.transfers.features.${id}`);
      expect(def, `feature ${id} must exist`).not.toBeNull();
      expect(def.type).toBe('FEATURE');
      expect(def.defaultPolicy.enabled).toBe(true);
      expect(def.configurable.enabled).toBe(true);
    }
  });

  it('registers all 6 workflow fields as platform-enforced and non-configurable with CRITICAL risk', () => {
    const fieldIds = [
      'sourceWarehouse',
      'destinationWarehouse',
      'product',
      'quantity',
      'reason',
      'batch',
    ];
    for (const id of fieldIds) {
      const def = getCapabilityControl(`inventory.transfers.fields.${id}`);
      expect(def, `field ${id} must exist`).not.toBeNull();
      expect(def.type).toBe('FIELD');
      expect(def.platformEnforced).toBe(true);
      expect(def.configurable.visible).toBe(false);
      expect(def.defaultPolicy.visible).toBe(true);
      expect(def.risk).toBe('CRITICAL');
    }
  });

  it('registers 4 actions with correct defaults, risk levels, permissions, and dependencies', () => {
    const postDef = getCapabilityControl('inventory.transfers.actions.post');
    expect(postDef).not.toBeNull();
    expect(postDef.type).toBe('ACTION');
    expect(postDef.defaultPolicy.allowed).toBe(true);
    expect(postDef.configurable.allowed).toBe(true);
    expect(postDef.risk).toBe('CRITICAL');
    expect(postDef.requiredPermissions.allowed).toBe('inventory.transfer');
    expect(postDef.dependencies).toBeUndefined();

    const reverseDef = getCapabilityControl('inventory.transfers.actions.reverse');
    expect(reverseDef).not.toBeNull();
    expect(reverseDef.risk).toBe('CRITICAL');
    expect(reverseDef.requiredPermissions.allowed).toBe('inventory.transfer.reverse');
    expect(reverseDef.dependencies).toBeUndefined();

    const inspectDef = getCapabilityControl('inventory.transfers.actions.inspect');
    expect(inspectDef).not.toBeNull();
    expect(inspectDef.risk).toBe('NORMAL');
    expect(inspectDef.requiredPermissions.allowed).toBe('inventory.view');
    expect(inspectDef.dependencies).toBeUndefined();

    const viewStockDef = getCapabilityControl('inventory.transfers.actions.viewStock');
    expect(viewStockDef).not.toBeNull();
    expect(viewStockDef.risk).toBe('NORMAL');
    expect(viewStockDef.dependencies).toEqual(['inventory.stock']);
  });

  it('rejects override attempts on all 6 platform-enforced workflow fields', async () => {
    const { capabilityService } = createHarness();
    const fieldIds = [
      'sourceWarehouse',
      'destinationWarehouse',
      'product',
      'quantity',
      'reason',
      'batch',
    ];
    for (const id of fieldIds) {
      await expect(
        capabilityService.updatePolicy(
          'org-a',
          {
            expectedVersion: 0,
            changes: [
              { key: `inventory.transfers.fields.${id}`, value: { visible: false } },
            ],
          },
          { actorId: 'platform-admin' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('rejects unknown inventory.transfers.* keys', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'inventory.transfers.features.nonExistent', value: { enabled: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('does not register any negative-stock capability key', () => {
    const all = listCapabilityControls();
    const negativeStockKeys = all.filter((c) => c.key.includes('negative-stock'));
    expect(negativeStockKeys).toHaveLength(0);
    const overrideKey = getCapabilityControl('inventory.negative-stock.override');
    expect(overrideKey).toBeNull();
  });

  it('viewStock action has dependency on inventory.stock', () => {
    const def = getCapabilityControl('inventory.transfers.actions.viewStock');
    expect(def.dependencies).toEqual(['inventory.stock']);
  });
});

// ── Module Capability Service Controls ───────────────────────────────────────

describe('Warehouse Transfers capability service controls', () => {
  it('resolves all inventory.transfers.* as enabled/allowed by default', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: ['inventory.view', 'inventory.transfer', 'inventory.transfer.reverse'],
    });

    expect(ctrl(effective, 'inventory.transfers').effectiveValue.enabled).toBe(true);
    for (const id of [
      'moduleInfo',
      'productSearch',
      'productContext',
      'stockContext',
      'guidance',
      'recentTransfers',
      'serverTransferDate',
    ]) {
      expect(
        ctrl(effective, `inventory.transfers.features.${id}`).effectiveValue.enabled,
        `feature ${id}`,
      ).toBe(true);
    }
    for (const id of [
      'sourceWarehouse',
      'destinationWarehouse',
      'product',
      'quantity',
      'reason',
      'batch',
    ]) {
      expect(
        ctrl(effective, `inventory.transfers.fields.${id}`).effectiveValue.visible,
        `field ${id}`,
      ).toBe(true);
    }
    expect(ctrl(effective, 'inventory.transfers.actions.post').effectiveValue.allowed).toBe(true);
    expect(ctrl(effective, 'inventory.transfers.actions.reverse').effectiveValue.allowed).toBe(true);
    expect(ctrl(effective, 'inventory.transfers.actions.inspect').effectiveValue.allowed).toBe(true);
    expect(ctrl(effective, 'inventory.transfers.actions.viewStock').effectiveValue.allowed).toBe(true);
  });

  it('assertAllowed rejects ORG_CAPABILITY_DISABLED when module is disabled for org-a', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.transfers', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.transfers', 'enabled'),
    ).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
  });

  it('org-b remains unaffected when org-a disables the transfers module', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.transfers', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-b', 'inventory.transfers', 'enabled'),
    ).resolves.toBeTruthy();
  });

  it('disabling Post action rejects ORG_ACTION_NOT_ALLOWED while keeping module enabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.transfers.actions.post', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.transfers.actions.post', 'allowed'),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.transfers', 'enabled'),
    ).resolves.toBeTruthy();
  });

  it('disabling Reverse action rejects ORG_ACTION_NOT_ALLOWED while keeping module enabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.transfers.actions.reverse', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.transfers.actions.reverse', 'allowed'),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    await expect(
      capabilityService.assertAllowed('org-a', 'inventory.transfers', 'enabled'),
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
    expect(ctrl(effective, 'inventory.transfers.actions.viewStock')).toMatchObject({
      effectiveValue: { allowed: false },
      reasons: ['dependency_disabled'],
    });
    expect(
      ctrl(effective, 'inventory.transfers.actions.inspect').effectiveValue.allowed,
    ).toBe(true);
  });

  it('resetModule removes only inventory.transfers.* overrides with audit and version increment', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        reason: 'Restrict Transfers',
        changes: [
          { key: 'inventory.transfers', value: { enabled: false } },
          { key: 'inventory.transfers.actions.post', value: { allowed: false } },
          { key: 'inventory.adjustments.actions.post', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    expect((await capabilityService.resolveEffective('org-a')).version).toBe(1);

    const moduleReset = await capabilityService.resetModule(
      'org-a',
      'inventory.transfers',
      1,
      { actorId: 'platform-admin' },
      'Restore Transfer defaults',
    );

    expect(moduleReset.version).toBe(2);
    expect(ctrl(moduleReset, 'inventory.transfers').override).toBeNull();
    expect(ctrl(moduleReset, 'inventory.transfers').effectiveValue.enabled).toBe(true);
    expect(ctrl(moduleReset, 'inventory.transfers.actions.post').override).toBeNull();
    expect(ctrl(moduleReset, 'inventory.transfers.actions.post').effectiveValue.allowed).toBe(true);
    // unrelated module override must be preserved
    expect(ctrl(moduleReset, 'inventory.adjustments.actions.post').override).toEqual({
      allowed: false,
    });

    const auditEvents = auditStore.listForTest();
    const transferAuditEvents = auditEvents.filter(
      (e) =>
        e.organizationId === 'org-a' &&
        typeof e.metadata?.controlKey === 'string' &&
        e.metadata.controlKey.startsWith('inventory.transfers'),
    );
    expect(transferAuditEvents.length).toBeGreaterThanOrEqual(2);
    expect(auditEvents.at(-1)).toMatchObject({
      actorId: 'platform-admin',
      organizationId: 'org-a',
      metadata: { versionBefore: 1, versionAfter: 2, newOverride: null },
    });
  });

  it('resetModule for inventory.transfers does not affect org-b', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.transfers', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await capabilityService.updatePolicy(
      'org-b',
      {
        expectedVersion: 0,
        changes: [{ key: 'inventory.transfers.actions.post', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await capabilityService.resetModule(
      'org-a',
      'inventory.transfers',
      1,
      { actorId: 'platform-admin' },
    );

    const orgB = await capabilityService.resolveEffective('org-b');
    expect(ctrl(orgB, 'inventory.transfers.actions.post').override).toEqual({ allowed: false });
    expect(ctrl(orgB, 'inventory.transfers.actions.post').effectiveValue.allowed).toBe(false);
  });

  it('resetModule rejects an unknown module key', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.resetModule('org-a', 'inventory.transfers.nonexistent', 0, {
        actorId: 'platform-admin',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('individual resetOverride removes one inventory.transfers override and increments version', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'inventory.transfers.actions.post', value: { allowed: false } },
          { key: 'inventory.transfers.actions.reverse', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const afterReset = await capabilityService.resetOverride(
      'org-a',
      'inventory.transfers.actions.post',
      1,
      { actorId: 'platform-admin' },
      'Re-enable transfer posting',
    );

    expect(afterReset.version).toBe(2);
    expect(ctrl(afterReset, 'inventory.transfers.actions.post').override).toBeNull();
    expect(ctrl(afterReset, 'inventory.transfers.actions.reverse').override).toEqual({
      allowed: false,
    });
  });
});
