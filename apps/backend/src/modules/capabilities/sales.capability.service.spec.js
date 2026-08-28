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

const SALES_KEYS = [
  'sales',
  'sales.features.search',
  'sales.features.statusFilter',
  'sales.features.customerSearch',
  'sales.features.productSearch',
  'sales.fields.customer',
  'sales.fields.notes',
  'sales.fields.packagingUnit',
  'sales.fields.branch',
  'sales.fields.warehouse',
  'sales.fields.saleDate',
  'sales.fields.product',
  'sales.fields.quantity',
  'sales.fields.unitPrice',
  'sales.fields.invoiceNumber',
  'sales.fields.lifecycleStatus',
  'sales.fields.saleTotal',
  'sales.fields.paidTotal',
  'sales.fields.receivableTotal',
  'sales.fields.paymentDetails',
  'sales.actions.createDraft',
  'sales.actions.inspect',
  'sales.actions.editDraft',
  'sales.actions.discardDraft',
  'sales.actions.post',
  'sales.actions.cancel',
  'sales.actions.print',
  'sales.actions.createReturn',
  'sales.actions.addPaymentAtPost',
  'sales.actions.sellOnCredit',
  'sales.actions.overridePrice',
  'sales.actions.approveCreditLimit',
  'sales.actions.approveExpiredStock',
  'sales.actions.overrideNegativeStock',
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

describe('Sales capability registry and service', () => {
  it('registers the exact authoritative 34-control Sales model', () => {
    const definitions = listCapabilityControls().filter((item) => item.moduleKey === 'sales');
    expect(definitions.map((item) => item.key)).toEqual(SALES_KEYS);
    expect(definitions.filter((item) => item.type === 'MODULE')).toHaveLength(1);
    expect(definitions.filter((item) => item.type === 'FEATURE')).toHaveLength(4);
    expect(definitions.filter((item) => item.type === 'FIELD')).toHaveLength(15);
    expect(definitions.filter((item) => item.type === 'ACTION')).toHaveLength(14);
    expect(definitions.filter((item) => item.platformEnforced)).toHaveLength(14);
    expect(definitions.filter((item) => item.type === 'VIEW')).toHaveLength(0);
  });

  it('keeps RBAC and action dependencies authoritative', async () => {
    const { capabilityService } = createHarness();
    const viewOnly = await capabilityService.resolveEffective('org-a', {
      permissions: ['sales.view'],
    });
    expect(control(viewOnly, 'sales').effectiveValue.enabled).toBe(true);
    expect(control(viewOnly, 'sales.actions.inspect').effectiveValue.allowed).toBe(true);
    expect(control(viewOnly, 'sales.actions.post').effectiveValue.allowed).toBe(false);
    expect(control(viewOnly, 'sales.actions.post').reasons).toContain('permission_denied');

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'sales.actions.post', value: { allowed: false } },
          { key: 'returns.actions.post', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const dependent = await capabilityService.resolveEffective('org-a');
    for (const key of [
      'sales.actions.addPaymentAtPost',
      'sales.actions.sellOnCredit',
      'sales.actions.overridePrice',
      'sales.actions.approveCreditLimit',
      'sales.actions.approveExpiredStock',
      'sales.actions.overrideNegativeStock',
      'sales.actions.createReturn',
    ]) {
      expect(control(dependent, key).effectiveValue.allowed).toBe(false);
      expect(control(dependent, key).reasons).toContain('dependency_disabled');
    }
    expect(control(dependent, 'sales.actions.inspect').effectiveValue.allowed).toBe(true);
  });

  it('prevents organization overrides from disabling required workflow infrastructure', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'sales.features.productSearch', value: { enabled: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'sales.fields.saleTotal', value: { visible: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('resets only Sales overrides with tenant-isolated audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'sales.actions.cancel', value: { allowed: false } },
          { key: 'accounts.actions.transfer', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const reset = await capabilityService.resetModule(
      'org-a',
      'sales',
      1,
      { actorId: 'platform-admin' },
      'Restore Sales defaults',
    );
    expect(control(reset, 'sales.actions.cancel').override).toBeNull();
    expect(control(reset, 'accounts.actions.transfer').override).toEqual({ allowed: false });
    expect(control(await capabilityService.resolveEffective('org-b'), 'sales').override).toBeNull();
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });
});
