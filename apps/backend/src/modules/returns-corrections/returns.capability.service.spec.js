import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityStoreModule from '../capabilities/capability.store';
import capabilityServiceModule from '../capabilities/capability.service';
import capabilityRegistryModule from '../capabilities/capability.registry';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { listCapabilityControls, getCapabilityControl, RETURNS_MODULE_KEY } =
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

describe('Returns and Corrections capability registry', () => {
  it('exports the correct module key constant', () => {
    expect(RETURNS_MODULE_KEY).toBe('returns');
  });

  it('registers exactly 17 returns.* controls', () => {
    const all = listCapabilityControls();
    const returns = all.filter((c) => c.moduleKey === RETURNS_MODULE_KEY);
    expect(returns).toHaveLength(17);
  });

  it('registers the root MODULE with enabled default, CRITICAL risk, and configurable enabled', () => {
    const def = getCapabilityControl('returns');
    expect(def).not.toBeNull();
    expect(def.type).toBe('MODULE');
    expect(def.risk).toBe('CRITICAL');
    expect(def.defaultPolicy).toEqual({ enabled: true });
    expect(def.configurable).toEqual({ enabled: true });
    expect(def.parentKey).toBeNull();
    expect(def.requiredPermissions.enabled).toBe('returns.view');
  });

  it('registers all 4 presentation features as configurable', () => {
    const featureIds = ['moduleInfo', 'typeFilter', 'statusFilter', 'warehouseFilter'];
    for (const id of featureIds) {
      const def = getCapabilityControl(`returns.features.${id}`);
      expect(def, `feature ${id} must exist`).not.toBeNull();
      expect(def.type).toBe('FEATURE');
      expect(def.defaultPolicy.enabled).toBe(true);
      expect(def.configurable.enabled).toBe(true);
    }
  });

  it('registers all 8 workflow fields as platform-enforced and non-configurable with CRITICAL risk', () => {
    const fieldIds = [
      'warehouse',
      'product',
      'quantity',
      'reason',
      'batch',
      'resolution',
      'refundAccount',
      'approvedReturnValue',
    ];
    for (const id of fieldIds) {
      const def = getCapabilityControl(`returns.fields.${id}`);
      expect(def, `field ${id} must exist`).not.toBeNull();
      expect(def.type).toBe('FIELD');
      expect(def.platformEnforced).toBe(true);
      expect(def.configurable.visible).toBe(false);
      expect(def.defaultPolicy.visible).toBe(true);
      expect(def.risk).toBe('CRITICAL');
    }
  });

  it('registers 4 actions with correct defaults, risk levels, and permissions', () => {
    const postDef = getCapabilityControl('returns.actions.post');
    expect(postDef).not.toBeNull();
    expect(postDef.type).toBe('ACTION');
    expect(postDef.defaultPolicy.allowed).toBe(true);
    expect(postDef.configurable.allowed).toBe(true);
    expect(postDef.risk).toBe('CRITICAL');
    expect(postDef.requiredPermissions.allowed).toBe('returns.post');
    expect(postDef.dependencies).toBeUndefined();

    const withoutInvoiceDef = getCapabilityControl('returns.actions.withoutInvoice');
    expect(withoutInvoiceDef).not.toBeNull();
    expect(withoutInvoiceDef.risk).toBe('CRITICAL');
    expect(withoutInvoiceDef.requiredPermissions.allowed).toBe('returns.without-invoice.approve');
    expect(withoutInvoiceDef.dependencies).toBeUndefined();

    const reverseDef = getCapabilityControl('returns.actions.reverse');
    expect(reverseDef).not.toBeNull();
    expect(reverseDef.risk).toBe('CRITICAL');
    expect(reverseDef.requiredPermissions.allowed).toBe('returns.reverse');
    expect(reverseDef.dependencies).toBeUndefined();

    const inspectDef = getCapabilityControl('returns.actions.inspect');
    expect(inspectDef).not.toBeNull();
    expect(inspectDef.risk).toBe('NORMAL');
    expect(inspectDef.requiredPermissions.allowed).toBe('returns.view');
    expect(inspectDef.dependencies).toBeUndefined();
  });

  it('rejects override attempts on all 8 platform-enforced workflow fields', async () => {
    const { capabilityService } = createHarness();
    const fieldIds = [
      'warehouse',
      'product',
      'quantity',
      'reason',
      'batch',
      'resolution',
      'refundAccount',
      'approvedReturnValue',
    ];
    for (const id of fieldIds) {
      await expect(
        capabilityService.updatePolicy(
          'org-a',
          {
            expectedVersion: 0,
            changes: [{ key: `returns.fields.${id}`, value: { visible: false } }],
          },
          { actorId: 'platform-admin' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('rejects unknown returns.* keys', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'returns.features.nonExistent', value: { enabled: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('does not register any capability control for financial/inventory calculations', () => {
    const all = listCapabilityControls();
    const calcKeys = all.filter(
      (c) =>
        c.moduleKey === RETURNS_MODULE_KEY &&
        (c.key.includes('valuation') || c.key.includes('cogs') || c.key.includes('wac')),
    );
    expect(calcKeys).toHaveLength(0);
  });
});

// ── Module Capability Service Controls ───────────────────────────────────────

describe('Returns and Corrections capability service controls', () => {
  it('resolves all returns.* as enabled/allowed by default', async () => {
    const { capabilityService } = createHarness();
    const effective = await capabilityService.resolveEffective('org-a', {
      permissions: [
        'returns.view',
        'returns.post',
        'returns.without-invoice.approve',
        'returns.reverse',
      ],
    });

    expect(ctrl(effective, 'returns').effectiveValue.enabled).toBe(true);
    for (const id of ['moduleInfo', 'typeFilter', 'statusFilter', 'warehouseFilter']) {
      expect(ctrl(effective, `returns.features.${id}`).effectiveValue.enabled, `feature ${id}`).toBe(
        true,
      );
    }
    for (const id of [
      'warehouse',
      'product',
      'quantity',
      'reason',
      'batch',
      'resolution',
      'refundAccount',
      'approvedReturnValue',
    ]) {
      expect(ctrl(effective, `returns.fields.${id}`).effectiveValue.visible, `field ${id}`).toBe(
        true,
      );
    }
    expect(ctrl(effective, 'returns.actions.post').effectiveValue.allowed).toBe(true);
    expect(ctrl(effective, 'returns.actions.withoutInvoice').effectiveValue.allowed).toBe(true);
    expect(ctrl(effective, 'returns.actions.reverse').effectiveValue.allowed).toBe(true);
    expect(ctrl(effective, 'returns.actions.inspect').effectiveValue.allowed).toBe(true);
  });

  it('assertAllowed rejects ORG_CAPABILITY_DISABLED when module is disabled for org-a', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'returns', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'returns', 'enabled'),
    ).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
  });

  it('org-b remains unaffected when org-a disables the Returns module', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'returns', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-b', 'returns', 'enabled'),
    ).resolves.toBeTruthy();
  });

  it('disabling Post action rejects ORG_ACTION_NOT_ALLOWED while keeping module enabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'returns.actions.post', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'returns.actions.post', 'allowed'),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    await expect(capabilityService.assertAllowed('org-a', 'returns', 'enabled')).resolves.toBeTruthy();
  });

  it('disabling Return Without Invoice action rejects ORG_ACTION_NOT_ALLOWED while keeping module enabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'returns.actions.withoutInvoice', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'returns.actions.withoutInvoice', 'allowed'),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    await expect(capabilityService.assertAllowed('org-a', 'returns', 'enabled')).resolves.toBeTruthy();
  });

  it('disabling Reverse action rejects ORG_ACTION_NOT_ALLOWED while keeping module enabled', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'returns.actions.reverse', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await expect(
      capabilityService.assertAllowed('org-a', 'returns.actions.reverse', 'allowed'),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    await expect(capabilityService.assertAllowed('org-a', 'returns', 'enabled')).resolves.toBeTruthy();
  });

  it('resetModule removes only returns.* overrides with audit and version increment', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        reason: 'Restrict Returns',
        changes: [
          { key: 'returns', value: { enabled: false } },
          { key: 'returns.actions.post', value: { allowed: false } },
          { key: 'inventory.transfers.actions.post', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    expect((await capabilityService.resolveEffective('org-a')).version).toBe(1);

    const moduleReset = await capabilityService.resetModule(
      'org-a',
      'returns',
      1,
      { actorId: 'platform-admin' },
      'Restore Returns defaults',
    );

    expect(moduleReset.version).toBe(2);
    expect(ctrl(moduleReset, 'returns').override).toBeNull();
    expect(ctrl(moduleReset, 'returns').effectiveValue.enabled).toBe(true);
    expect(ctrl(moduleReset, 'returns.actions.post').override).toBeNull();
    expect(ctrl(moduleReset, 'returns.actions.post').effectiveValue.allowed).toBe(true);
    // unrelated module override must be preserved
    expect(ctrl(moduleReset, 'inventory.transfers.actions.post').override).toEqual({
      allowed: false,
    });

    const auditEvents = auditStore.listForTest();
    const returnsAuditEvents = auditEvents.filter(
      (e) =>
        e.organizationId === 'org-a' &&
        typeof e.metadata?.controlKey === 'string' &&
        e.metadata.controlKey.startsWith('returns'),
    );
    expect(returnsAuditEvents.length).toBeGreaterThanOrEqual(2);
    expect(auditEvents.at(-1)).toMatchObject({
      actorId: 'platform-admin',
      organizationId: 'org-a',
      metadata: { versionBefore: 1, versionAfter: 2, newOverride: null },
    });
  });

  it('resetModule for returns does not affect org-b', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'returns', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    await capabilityService.updatePolicy(
      'org-b',
      {
        expectedVersion: 0,
        changes: [{ key: 'returns.actions.post', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );

    await capabilityService.resetModule('org-a', 'returns', 1, { actorId: 'platform-admin' });

    const orgB = await capabilityService.resolveEffective('org-b');
    expect(ctrl(orgB, 'returns.actions.post').override).toEqual({ allowed: false });
    expect(ctrl(orgB, 'returns.actions.post').effectiveValue.allowed).toBe(false);
  });

  it('resetModule rejects an unknown module key', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.resetModule('org-a', 'returns.nonexistent', 0, {
        actorId: 'platform-admin',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('individual resetOverride removes one returns override and increments version', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'returns.actions.post', value: { allowed: false } },
          { key: 'returns.actions.reverse', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    const afterReset = await capabilityService.resetOverride(
      'org-a',
      'returns.actions.post',
      1,
      { actorId: 'platform-admin' },
      'Re-enable return posting',
    );

    expect(afterReset.version).toBe(2);
    expect(ctrl(afterReset, 'returns.actions.post').override).toBeNull();
    expect(ctrl(afterReset, 'returns.actions.reverse').override).toEqual({ allowed: false });
  });
});
