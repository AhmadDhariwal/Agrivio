import { describe, expect, it } from 'vitest';
import transactionRunnerModule from '../../platform/transactions/transaction-runner';
import auditWriterModule from '../../platform/audit/audit-writer';
import capabilityStoreModule from './capability.store';
import capabilityServiceModule from './capability.service';
import capabilityRegistryModule from './capability.registry';
import suppliersStoreModule from '../suppliers/suppliers.store';
import suppliersModule from '../suppliers/suppliers.module';
import paymentsServiceModule from '../payments-ledgers/payments.service';

const { createMockTransactionSessionPort, createTransactionRunner } = transactionRunnerModule;
const { createInMemoryAuditEventStore } = auditWriterModule;
const { createInMemoryCapabilityPolicyStore } = capabilityStoreModule;
const { createCapabilityService } = capabilityServiceModule;
const { listCapabilityControls } = capabilityRegistryModule;
const { createInMemorySuppliersStore } = suppliersStoreModule;
const { createSuppliersService } = suppliersModule;
const { createPaymentsService } = paymentsServiceModule;

const SUPPLIER_LEDGER_KEYS = [
  'payments.supplierLedger',
  'payments.supplierLedger.features.moduleInfo',
  'payments.supplierLedger.features.supplierSearch',
  'payments.supplierLedger.features.reconciliationSummary',
  'payments.supplierLedger.features.ledgerFilters',
  'payments.supplierLedger.fields.supplierIdentity',
  'payments.supplierLedger.fields.outstandingPayable',
  'payments.supplierLedger.fields.supplierAdvance',
  'payments.supplierLedger.fields.reconciliationStatus',
  'payments.supplierLedger.fields.allocationTotal',
  'payments.supplierLedger.fields.date',
  'payments.supplierLedger.fields.reference',
  'payments.supplierLedger.fields.entryType',
  'payments.supplierLedger.fields.effectKind',
  'payments.supplierLedger.fields.signedAmount',
  'payments.supplierLedger.fields.sourceStatus',
  'payments.supplierLedger.actions.viewSource',
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

describe('Supplier Ledger capability registry and service', () => {
  it('registers the exact authoritative 17-control read-only model', () => {
    const definitions = listCapabilityControls().filter(
      (item) => item.moduleKey === 'payments.supplierLedger',
    );
    expect(definitions.map((item) => item.key)).toEqual(SUPPLIER_LEDGER_KEYS);
    expect(definitions.filter((item) => item.type === 'MODULE')).toHaveLength(1);
    expect(definitions.filter((item) => item.type === 'FEATURE')).toHaveLength(4);
    expect(definitions.filter((item) => item.type === 'FIELD')).toHaveLength(11);
    expect(definitions.filter((item) => item.type === 'ACTION')).toHaveLength(1);
    expect(definitions.filter((item) => item.platformEnforced)).toHaveLength(12);
    expect(definitions.some((item) => item.configurable.editable !== undefined)).toBe(false);
    expect(
      definitions.find(
        (item) => item.key === 'payments.supplierLedger.features.supplierSearch',
      ),
    ).toMatchObject({
      defaultPolicy: { enabled: true },
      configurable: { enabled: false },
      platformEnforced: true,
      risk: 'CRITICAL',
    });
  });

  it('searches the complete active tenant supplier set before applying the 25-result bound', async () => {
    const supplierStore = createInMemorySuppliersStore();
    for (let index = 0; index < 30; index += 1) {
      const name = `Common Supplier ${String(index).padStart(2, '0')}`;
      await supplierStore.insertSupplier(null, {
        organizationId: 'org-a',
        name,
        nameNormalized: name.toLowerCase(),
        status: 'active',
        version: 1,
      });
    }
    await supplierStore.insertSupplier(null, {
      organizationId: 'org-a',
      name: 'Needle Beyond Initial Limit',
      nameNormalized: 'needle beyond initial limit',
      status: 'active',
      version: 1,
    });
    await supplierStore.insertSupplier(null, {
      organizationId: 'org-a',
      name: 'Needle Inactive',
      nameNormalized: 'needle inactive',
      status: 'inactive',
      version: 1,
    });
    await supplierStore.insertSupplier(null, {
      organizationId: 'org-b',
      name: 'Needle Other Tenant',
      nameNormalized: 'needle other tenant',
      status: 'active',
      version: 1,
    });

    const suppliersService = createSuppliersService({ store: supplierStore });
    const paymentsService = createPaymentsService({
      store: { appendAuditEvent: async () => undefined },
      ledgersService: {},
      suppliersService,
      persistence: 'memory',
    });

    const initial = await paymentsService.listSupplierLedgerSuppliers('org-a', '');
    expect(initial.items).toHaveLength(25);
    expect(initial.items.some((item) => item.name === 'Needle Beyond Initial Limit')).toBe(false);

    const searched = await paymentsService.listSupplierLedgerSuppliers('org-a', 'needle');
    expect(searched.items).toHaveLength(1);
    expect(searched.items[0]).toMatchObject({
      organizationId: 'org-a',
      name: 'Needle Beyond Initial Limit',
      status: 'active',
    });
  });

  it('intersects every control with supplier-payments.view RBAC', async () => {
    const { capabilityService } = createHarness();
    const denied = await capabilityService.resolveEffective('org-a', { permissions: [] });
    expect(control(denied, 'payments.supplierLedger').effectiveValue.enabled).toBe(false);
    expect(
      control(denied, 'payments.supplierLedger.features.supplierSearch').effectiveValue.enabled,
    ).toBe(false);
    expect(
      control(denied, 'payments.supplierLedger.actions.viewSource').effectiveValue.allowed,
    ).toBe(false);

    const allowed = await capabilityService.resolveEffective('org-a', {
      permissions: ['supplier-payments.view'],
    });
    expect(control(allowed, 'payments.supplierLedger').effectiveValue.enabled).toBe(true);
    expect(
      control(allowed, 'payments.supplierLedger.fields.signedAmount').effectiveValue.visible,
    ).toBe(true);
  });

  it('rejects organization attempts to disable the required supplier selector', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [
            {
              key: 'payments.supplierLedger.features.supplierSearch',
              value: { enabled: false },
            },
          ],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('makes the Supplier Payments launch depend one-way on Supplier Ledger availability', async () => {
    const { capabilityService } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [{ key: 'payments.supplierLedger', value: { enabled: false } }],
      },
      { actorId: 'platform-admin' },
    );
    const ledgerDisabled = await capabilityService.resolveEffective('org-a', {
      permissions: ['supplier-payments.view'],
    });
    expect(control(ledgerDisabled, 'payments.supplier').effectiveValue.enabled).toBe(true);
    expect(
      control(ledgerDisabled, 'payments.supplier.actions.viewLedger').effectiveValue.allowed,
    ).toBe(false);
    expect(control(ledgerDisabled, 'payments.supplier.actions.viewLedger').reasons).toContain(
      'dependency_disabled',
    );

    const second = createHarness();
    await second.capabilityService.updatePolicy(
      'org-b',
      { expectedVersion: 0, changes: [{ key: 'payments.supplier', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    const paymentsDisabled = await second.capabilityService.resolveEffective('org-b', {
      permissions: ['supplier-payments.view'],
    });
    expect(control(paymentsDisabled, 'payments.supplier').effectiveValue.enabled).toBe(false);
    expect(control(paymentsDisabled, 'payments.supplierLedger').effectiveValue.enabled).toBe(true);
  });

  it('keeps accounting-critical presentation platform enforced', async () => {
    const { capabilityService } = createHarness();
    for (const key of SUPPLIER_LEDGER_KEYS.filter((item) => item.includes('.fields.'))) {
      await expect(
        capabilityService.updatePolicy(
          'org-a',
          { expectedVersion: 0, changes: [{ key, value: { visible: false } }] },
          { actorId: 'platform-admin' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('resets only Supplier Ledger overrides with tenant-scoped audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          {
            key: 'payments.supplierLedger.features.ledgerFilters',
            value: { enabled: false },
          },
          { key: 'payments.supplier.actions.correct', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const reset = await capabilityService.resetModule(
      'org-a',
      'payments.supplierLedger',
      1,
      { actorId: 'platform-admin' },
      'Restore Supplier Ledger defaults',
    );
    expect(control(reset, 'payments.supplierLedger.features.ledgerFilters').override).toBeNull();
    expect(control(reset, 'payments.supplier.actions.correct').override).toEqual({
      allowed: false,
    });
    expect(
      control(
        await capabilityService.resolveEffective('org-b'),
        'payments.supplierLedger.features.ledgerFilters',
      ).override,
    ).toBeNull();
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });
});
