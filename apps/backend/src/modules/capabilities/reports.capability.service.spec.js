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

const REPORT_KEYS = [
  'reports',
  'reports.features.moduleInfo',
  'reports.reportAvailability.sales',
  'reports.reportAvailability.purchases',
  'reports.reportAvailability.grossProfit',
  'reports.reportAvailability.stock',
  'reports.reportAvailability.stockValuation',
  'reports.reportAvailability.stockMovements',
  'reports.reportAvailability.customerLedger',
  'reports.reportAvailability.supplierLedger',
  'reports.reportAvailability.accountCashBook',
  'reports.reportAvailability.expenses',
  'reports.reportAvailability.lowStock',
  'reports.reportAvailability.expiry',
  'reports.reportAvailability.deadStock',
  'reports.reportAvailability.topProducts',
  'reports.reportAvailability.topCustomers',
  'reports.reportAvailability.employeeSales',
  'reports.actions.run',
  'reports.actions.exportPdf',
  'reports.actions.exportExcel',
  'reports.actions.exportCsv',
];

function createHarness(accessState = activeAccess()) {
  const auditStore = createInMemoryAuditEventStore();
  const capabilityService = createCapabilityService({
    store: createInMemoryCapabilityPolicyStore(),
    auditStore,
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => accessState,
  });
  return { capabilityService, auditStore };
}

function activeAccess(entitlements = { reportsExports: true }) {
  return { status: 'active', accessLevel: 'operational', plan: { entitlements } };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

describe('Reports capability registry and service', () => {
  it('registers the exact authoritative 22-control Reports model', () => {
    const definitions = listCapabilityControls().filter((item) => item.moduleKey === 'reports');
    expect(definitions.map((item) => item.key)).toEqual(REPORT_KEYS);
    expect(definitions.filter((item) => item.type === 'MODULE')).toHaveLength(1);
    expect(definitions.filter((item) => item.key.startsWith('reports.reportAvailability.'))).toHaveLength(16);
    expect(definitions.filter((item) => item.key.startsWith('reports.features.'))).toHaveLength(1);
    expect(definitions.filter((item) => item.type === 'ACTION')).toHaveLength(4);
    expect(definitions.every((item) => (item.dependencies ?? []).length === 0)).toBe(true);
  });

  it('intersects Reports controls with suspended-read subscription access, export entitlement, and RBAC', async () => {
    const suspended = createHarness({
      status: 'suspended',
      accessLevel: 'read-only',
      plan: { entitlements: { reportsExports: false } },
    });
    const result = await suspended.capabilityService.resolveEffective('org-a', {
      permissions: ['reports.view', 'reports.export'],
    });
    expect(control(result, 'reports').effectiveValue.enabled).toBe(true);
    expect(control(result, 'reports.reportAvailability.sales').effectiveValue.enabled).toBe(true);
    expect(control(result, 'reports.actions.run').effectiveValue.allowed).toBe(true);
    expect(control(result, 'reports.actions.exportCsv').effectiveValue.allowed).toBe(false);
    expect(control(result, 'reports.actions.exportCsv').reasons).toContain('entitlement_unavailable');

    const viewOnly = await createHarness().capabilityService.resolveEffective('org-a', {
      permissions: ['reports.view'],
    });
    expect(control(viewOnly, 'reports.actions.run').effectiveValue.allowed).toBe(true);
    expect(control(viewOnly, 'reports.actions.exportPdf').effectiveValue.allowed).toBe(false);
    expect(control(viewOnly, 'reports.actions.exportPdf').reasons).toContain('permission_denied');
  });

  it('disables one report independently and cascades a module disable to every Reports control', async () => {
    const oneReport = createHarness();
    await oneReport.capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'reports.reportAvailability.sales', value: { enabled: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    await expect(
      oneReport.capabilityService.assertAllowed(
        'org-a',
        'reports.reportAvailability.sales',
        'enabled',
        { permissions: ['reports.view'] },
      ),
    ).rejects.toMatchObject({ code: 'ORG_CAPABILITY_DISABLED' });
    await expect(
      oneReport.capabilityService.assertAllowed(
        'org-a',
        'reports.reportAvailability.purchases',
        'enabled',
        { permissions: ['reports.view'] },
      ),
    ).resolves.toBeTruthy();

    const wholeModule = createHarness();
    await wholeModule.capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'reports', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    const result = await wholeModule.capabilityService.resolveEffective('org-a', {
      permissions: ['reports.view', 'reports.export'],
    });
    expect(control(result, 'reports.actions.run').effectiveValue.allowed).toBe(false);
    expect(control(result, 'reports.actions.exportCsv').effectiveValue.allowed).toBe(false);
    expect(control(result, 'reports.reportAvailability.employeeSales').effectiveValue.enabled).toBe(false);
  });

  it('resets only Reports overrides with versioned audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'reports.actions.exportCsv', value: { allowed: false } },
          { key: 'reports.reportAvailability.stock', value: { enabled: false } },
          { key: 'accounts.actions.transfer', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const reset = await capabilityService.resetModule(
      'org-a',
      'reports',
      1,
      { actorId: 'platform-admin' },
      'Restore Reports defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'reports.actions.exportCsv').override).toBeNull();
    expect(control(reset, 'reports.reportAvailability.stock').override).toBeNull();
    expect(control(reset, 'accounts.actions.transfer').override).toEqual({ allowed: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });
});
