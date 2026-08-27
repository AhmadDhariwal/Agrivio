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

const SUPPLIER_PAYMENT_KEYS = [
  'payments.supplier',
  'payments.supplier.features.moduleInfo',
  'payments.supplier.features.paymentDateFilter',
  'payments.supplier.fields.notes',
  'payments.supplier.fields.paymentReference',
  'payments.supplier.fields.supplier',
  'payments.supplier.fields.account',
  'payments.supplier.fields.allocationMode',
  'payments.supplier.fields.amount',
  'payments.supplier.fields.paymentDate',
  'payments.supplier.fields.allocations',
  'payments.supplier.fields.status',
  'payments.supplier.actions.post',
  'payments.supplier.actions.postInvoiceSpecific',
  'payments.supplier.actions.inspect',
  'payments.supplier.actions.viewLedger',
  'payments.supplier.actions.correct',
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

describe('Supplier Payments capability registry and service', () => {
  it('registers the exact authoritative 17-control Supplier Payments model', () => {
    const definitions = listCapabilityControls().filter(
      (item) => item.moduleKey === 'payments.supplier',
    );
    expect(definitions.map((item) => item.key)).toEqual(SUPPLIER_PAYMENT_KEYS);
    expect(definitions.filter((item) => item.type === 'MODULE')).toHaveLength(1);
    expect(definitions.filter((item) => item.type === 'FEATURE')).toHaveLength(2);
    expect(definitions.filter((item) => item.type === 'FIELD')).toHaveLength(9);
    expect(definitions.filter((item) => item.type === 'ACTION')).toHaveLength(5);
    expect(definitions.filter((item) => item.platformEnforced)).toHaveLength(8);
  });

  it('keeps RBAC and invoice-specific dependency state authoritative', async () => {
    const { capabilityService } = createHarness();
    const viewOnly = await capabilityService.resolveEffective('org-a', {
      permissions: ['supplier-payments.view'],
    });
    expect(control(viewOnly, 'payments.supplier').effectiveValue.enabled).toBe(true);
    expect(control(viewOnly, 'payments.supplier.actions.inspect').effectiveValue.allowed).toBe(true);
    expect(control(viewOnly, 'payments.supplier.actions.post').effectiveValue.allowed).toBe(false);
    expect(control(viewOnly, 'payments.supplier.actions.correct').effectiveValue.allowed).toBe(false);

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'payments.supplier.actions.post', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const dependent = await capabilityService.resolveEffective('org-a', {
      permissions: ['supplier-payments.view', 'supplier-payments.post'],
    });
    expect(
      control(dependent, 'payments.supplier.actions.postInvoiceSpecific').effectiveValue.allowed,
    ).toBe(false);
    expect(control(dependent, 'payments.supplier.actions.postInvoiceSpecific').reasons).toContain(
      'dependency_disabled',
    );
  });

  it('cascades disable and cleanly re-enables the submodule', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'payments.supplier', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const disabled = await capabilityService.resolveEffective('org-a');
    expect(
      disabled.controls
        .filter((item) => item.moduleKey === 'payments.supplier' && item.key !== 'payments.supplier')
        .every((item) => Object.values(item.effectiveValue).every((value) => value === false)),
    ).toBe(true);

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 1,
        changes: [{ key: 'payments.supplier', value: { enabled: true } }],
      },
      { actorId: 'platform-admin' },
    );
    const enabled = await capabilityService.resolveEffective('org-a');
    expect(control(enabled, 'payments.supplier.actions.post').effectiveValue.allowed).toBe(true);
    expect(control(enabled, 'payments.supplier.fields.notes').effectiveValue.editable).toBe(true);
  });

  it('resets only Supplier Payments overrides with tenant-scoped audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'payments.supplier.actions.correct', value: { allowed: false } },
          { key: 'accounts.actions.transfer', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const reset = await capabilityService.resetModule(
      'org-a',
      'payments.supplier',
      1,
      { actorId: 'platform-admin' },
      'Restore Supplier Payments defaults',
    );
    expect(control(reset, 'payments.supplier.actions.correct').override).toBeNull();
    expect(control(reset, 'accounts.actions.transfer').override).toEqual({ allowed: false });
    expect(
      control(
        await capabilityService.resolveEffective('org-b'),
        'payments.supplier.actions.correct',
      ).override,
    ).toBeNull();
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });
});
