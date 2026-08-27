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

const PURCHASE_KEYS = [
  'purchases',
  'purchases.features.moduleInfo',
  'purchases.features.search',
  'purchases.features.statusFilter',
  'purchases.fields.branch',
  'purchases.fields.supplierInvoiceReference',
  'purchases.fields.notes',
  'purchases.fields.packagingUnit',
  'purchases.fields.manufacturingDate',
  'purchases.fields.landedCosts',
  'purchases.fields.warehouse',
  'purchases.fields.supplier',
  'purchases.fields.purchaseDate',
  'purchases.fields.product',
  'purchases.fields.quantity',
  'purchases.fields.unitCost',
  'purchases.fields.batchNumber',
  'purchases.fields.expiryDate',
  'purchases.actions.createDraft',
  'purchases.actions.inspect',
  'purchases.actions.editDraft',
  'purchases.actions.discardDraft',
  'purchases.actions.post',
  'purchases.actions.cancel',
  'purchases.actions.createReturn',
  'purchases.actions.addPaymentAtPost',
];

function createHarness() {
  const auditStore = createInMemoryAuditEventStore();
  const capabilityService = createCapabilityService({
    store: createInMemoryCapabilityPolicyStore(),
    auditStore,
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
  });
  return { capabilityService, auditStore };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

describe('Purchases capability registry and service', () => {
  it('registers the exact authoritative 26-control Purchases model', () => {
    const definitions = listCapabilityControls().filter((item) => item.moduleKey === 'purchases');
    expect(definitions.map((item) => item.key)).toEqual(PURCHASE_KEYS);
    expect(definitions.filter((item) => item.type === 'MODULE')).toHaveLength(1);
    expect(definitions.filter((item) => item.type === 'FEATURE')).toHaveLength(3);
    expect(definitions.filter((item) => item.type === 'FIELD')).toHaveLength(14);
    expect(definitions.filter((item) => item.type === 'ACTION')).toHaveLength(8);
    expect(definitions.filter((item) => item.platformEnforced)).toHaveLength(8);
  });

  it('keeps RBAC and dependency state authoritative', async () => {
    const { capabilityService } = createHarness();
    const viewOnly = await capabilityService.resolveEffective('org-a', {
      permissions: ['purchases.view'],
    });
    expect(control(viewOnly, 'purchases').effectiveValue.enabled).toBe(true);
    expect(control(viewOnly, 'purchases.actions.inspect').effectiveValue.allowed).toBe(true);
    expect(control(viewOnly, 'purchases.actions.post').effectiveValue.allowed).toBe(false);
    expect(control(viewOnly, 'purchases.actions.post').reasons).toContain('permission_denied');

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'returns.actions.post', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const dependent = await capabilityService.resolveEffective('org-a', {
      permissions: ['purchases.view', 'purchases.return', 'returns.post', 'returns.view'],
    });
    expect(control(dependent, 'purchases.actions.createReturn').effectiveValue.allowed).toBe(false);
    expect(control(dependent, 'purchases.actions.createReturn').reasons).toContain(
      'dependency_disabled',
    );
    expect(control(dependent, 'purchases.actions.post').effectiveValue.allowed).toBe(false);
  });

  it('cascades module and post-action policy without affecting unrelated purchase actions', async () => {
    const actionHarness = createHarness();
    await actionHarness.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'purchases.actions.post', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const actionResult = await actionHarness.capabilityService.resolveEffective('org-a');
    expect(control(actionResult, 'purchases.actions.addPaymentAtPost').effectiveValue.allowed).toBe(
      false,
    );
    expect(control(actionResult, 'purchases.actions.inspect').effectiveValue.allowed).toBe(true);

    const moduleHarness = createHarness();
    await moduleHarness.capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'purchases', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    const moduleResult = await moduleHarness.capabilityService.resolveEffective('org-a');
    expect(
      moduleResult.controls
        .filter((item) => item.moduleKey === 'purchases' && item.key !== 'purchases')
        .every((item) => Object.values(item.effectiveValue).every((value) => value === false)),
    ).toBe(true);
  });

  it('resets only Purchases overrides and preserves organization isolation with audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'purchases.actions.cancel', value: { allowed: false } },
          { key: 'accounts.actions.transfer', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const reset = await capabilityService.resetModule(
      'org-a',
      'purchases',
      1,
      { actorId: 'platform-admin' },
      'Restore Purchases defaults',
    );
    expect(control(reset, 'purchases.actions.cancel').override).toBeNull();
    expect(control(reset, 'accounts.actions.transfer').override).toEqual({ allowed: false });
    expect(control(await capabilityService.resolveEffective('org-b'), 'purchases').override).toBeNull();
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });
});
