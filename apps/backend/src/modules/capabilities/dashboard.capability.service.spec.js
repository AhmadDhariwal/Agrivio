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

const DASHBOARD_KEYS = [
  'dashboard',
  'dashboard.features.datePeriodFilter',
  'dashboard.features.branchFilter',
  'dashboard.features.warehouseFilter',
  'dashboard.widgets.financialSummary',
  'dashboard.widgets.accountSummary',
  'dashboard.widgets.salesVsPurchasesTrend',
  'dashboard.widgets.grossProfitTrend',
  'dashboard.widgets.topSellingProducts',
  'dashboard.widgets.inventoryHealth',
  'dashboard.widgets.recentSales',
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

function activeAccess() {
  return { status: 'active', accessLevel: 'operational', plan: { entitlements: {} } };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

describe('Dashboard capability registry and service', () => {
  it('registers the exact grouped 11-control read-only Dashboard model', () => {
    const definitions = listCapabilityControls().filter(
      (item) => item.moduleKey === 'dashboard',
    );
    expect(definitions.map((item) => item.key)).toEqual(DASHBOARD_KEYS);
    expect(definitions.filter((item) => item.type === 'MODULE')).toHaveLength(1);
    expect(definitions.filter((item) => item.type === 'FEATURE')).toHaveLength(3);
    expect(definitions.filter((item) => item.type === 'WIDGET')).toHaveLength(7);
    expect(definitions.filter((item) => item.type === 'FIELD')).toHaveLength(0);
    expect(definitions.filter((item) => item.type === 'ACTION')).toHaveLength(0);
    expect(definitions.filter((item) => item.type === 'VIEW')).toHaveLength(0);
    expect(definitions.every((item) => item.requiredPermissions?.[Object.keys(item.defaultPolicy)[0]] === 'dashboard.view')).toBe(true);
    expect(definitions.every((item) => (item.dependencies ?? []).length === 0)).toBe(true);
    expect(definitions.every((item) => item.platformEnforced !== true)).toBe(true);
  });

  it('intersects Dashboard policy with operational subscription access and dashboard.view RBAC', async () => {
    const suspended = createHarness({
      status: 'suspended',
      accessLevel: 'read-only',
      plan: { entitlements: {} },
    });
    const suspendedResult = await suspended.capabilityService.resolveEffective('org-a', {
      permissions: ['dashboard.view'],
    });
    expect(control(suspendedResult, 'dashboard').effectiveValue.enabled).toBe(false);
    expect(control(suspendedResult, 'dashboard.widgets.financialSummary').effectiveValue.visible).toBe(false);
    expect(control(suspendedResult, 'dashboard').reasons).toContain('subscription_unavailable');

    const noPermission = await createHarness().capabilityService.resolveEffective('org-a', {
      permissions: [],
    });
    expect(control(noPermission, 'dashboard').effectiveValue.enabled).toBe(false);
    expect(control(noPermission, 'dashboard.widgets.recentSales').reasons).toContain(
      'permission_denied',
    );
  });

  it('cascades module disable and resets only Dashboard overrides with audit/version safety', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'dashboard', value: { enabled: false } },
          { key: 'dashboard.widgets.recentSales', value: { visible: false } },
          { key: 'reports.actions.exportCsv', value: { allowed: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );
    const disabled = await capabilityService.resolveEffective('org-a', {
      permissions: ['dashboard.view'],
    });
    expect(control(disabled, 'dashboard.widgets.financialSummary').effectiveValue.visible).toBe(
      false,
    );

    const reset = await capabilityService.resetModule(
      'org-a',
      'dashboard',
      1,
      { actorId: 'platform-admin' },
      'Restore Dashboard defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'dashboard').override).toBeNull();
    expect(control(reset, 'dashboard.widgets.recentSales').override).toBeNull();
    expect(control(reset, 'reports.actions.exportCsv').override).toEqual({ allowed: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      actorId: 'platform-admin',
      metadata: { versionBefore: 1, versionAfter: 2 },
    });
  });
});
