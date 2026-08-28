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

const CUSTOMER_PAYMENT_KEYS = [
  'payments.customer',
  'payments.customer.features.moduleInfo',
  'payments.customer.features.search',
  'payments.customer.features.paymentDateFilter',
  'payments.customer.features.customerSearch',
  'payments.customer.features.ledgerPreview',
  'payments.customer.fields.notes',
  'payments.customer.fields.customer',
  'payments.customer.fields.account',
  'payments.customer.fields.allocationMode',
  'payments.customer.fields.amount',
  'payments.customer.fields.paymentDate',
  'payments.customer.fields.allocations',
  'payments.customer.fields.status',
  'payments.customer.actions.post',
  'payments.customer.actions.postInvoiceSpecific',
  'payments.customer.actions.inspect',
  'payments.customer.actions.correct',
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

describe('Customer Payments capability registry and service', () => {
  it('registers the exact authoritative 18-control Customer Payments model', () => {
    const definitions = listCapabilityControls().filter(
      (item) => item.moduleKey === 'payments.customer',
    );
    expect(definitions.map((item) => item.key)).toEqual(CUSTOMER_PAYMENT_KEYS);
    expect(definitions.filter((item) => item.type === 'MODULE')).toHaveLength(1);
    expect(definitions.filter((item) => item.type === 'FEATURE')).toHaveLength(5);
    expect(definitions.filter((item) => item.type === 'FIELD')).toHaveLength(8);
    expect(definitions.filter((item) => item.type === 'ACTION')).toHaveLength(4);
    expect(definitions.filter((item) => item.platformEnforced)).toHaveLength(8);
  });

  it('keeps RBAC and the invoice-specific dependency authoritative', async () => {
    const { capabilityService } = createHarness();
    const viewOnly = await capabilityService.resolveEffective('org-a', {
      permissions: ['customer-payments.view'],
    });
    expect(control(viewOnly, 'payments.customer').effectiveValue.enabled).toBe(true);
    expect(control(viewOnly, 'payments.customer.actions.inspect').effectiveValue.allowed).toBe(true);
    expect(control(viewOnly, 'payments.customer.actions.post').effectiveValue.allowed).toBe(false);
    expect(control(viewOnly, 'payments.customer.actions.correct').effectiveValue.allowed).toBe(false);

    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'payments.customer.actions.post', value: { allowed: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const dependent = await capabilityService.resolveEffective('org-a', {
      permissions: ['customer-payments.view', 'customer-payments.post'],
    });
    expect(
      control(dependent, 'payments.customer.actions.postInvoiceSpecific').effectiveValue.allowed,
    ).toBe(false);
    expect(control(dependent, 'payments.customer.actions.postInvoiceSpecific').reasons).toContain(
      'dependency_disabled',
    );
  });

  it('prevents overrides of required workflow and history controls', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [
            { key: 'payments.customer.features.customerSearch', value: { enabled: false } },
          ],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'payments.customer.fields.amount', value: { visible: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('resets only Customer Payments overrides with tenant-scoped audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'payments.customer.actions.correct', value: { allowed: false } },
          { key: 'payments.supplier.actions.correct', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const reset = await capabilityService.resetModule(
      'org-a',
      'payments.customer',
      1,
      { actorId: 'platform-admin' },
      'Restore Customer Payments defaults',
    );
    expect(control(reset, 'payments.customer.actions.correct').override).toBeNull();
    expect(control(reset, 'payments.supplier.actions.correct').override).toEqual({ allowed: false });
    expect(
      control(
        await capabilityService.resolveEffective('org-b'),
        'payments.customer.actions.correct',
      ).override,
    ).toBeNull();
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });
});
