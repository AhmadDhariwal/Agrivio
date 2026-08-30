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

const BILLING_KEYS = [
  'billing',
  'billing.features.moduleInfo',
  'billing.features.currentSubscription',
  'billing.features.planSelection',
  'billing.features.billingHistory',
  'billing.fields.requestedPlan',
  'billing.fields.billingPeriod',
  'billing.fields.paymentMethod',
  'billing.fields.paymentReference',
  'billing.fields.amount',
  'billing.fields.evidence',
  'billing.fields.notes',
  'billing.actions.submit',
  'billing.actions.uploadEvidence',
  'billing.actions.downloadEvidence',
  'billing.actions.inspectHistory',
  'billing.actions.refresh',
];

function createHarness(status = 'active') {
  const auditStore = createInMemoryAuditEventStore();
  const capabilityService = createCapabilityService({
    store: createInMemoryCapabilityPolicyStore(),
    auditStore,
    transactionRunner: createTransactionRunner(createMockTransactionSessionPort().port),
    resolveSubscriptionAccessState: async () => ({
      status,
      accessLevel: status === 'suspended' ? 'billing' : 'operational',
    }),
  });
  return { capabilityService, auditStore };
}

function control(result, key) {
  return result.controls.find((item) => item.key === key);
}

describe('Billing capability controls', () => {
  it('registers the exact source-backed controls and required-field classifications', () => {
    const controls = listCapabilityControls().filter((item) => item.moduleKey === 'billing');
    expect(controls.map((item) => item.key)).toEqual(BILLING_KEYS);

    for (const key of [
      'billing.fields.requestedPlan',
      'billing.fields.billingPeriod',
      'billing.fields.paymentMethod',
      'billing.fields.paymentReference',
      'billing.fields.amount',
      'billing.fields.evidence',
    ]) {
      expect(controls.find((item) => item.key === key)).toMatchObject({
        defaultPolicy: { visible: true, editable: true },
        configurable: { visible: false, editable: false },
        platformEnforced: true,
        subscriptionLabel: 'billing-access',
      });
    }
    expect(controls.find((item) => item.key === 'billing.fields.notes')).toMatchObject({
      configurable: { visible: true, editable: true },
    });
  });

  it('resolves Default, Override, Effective and applies the Billing parent restriction', async () => {
    const { capabilityService } = createHarness();
    const defaults = await capabilityService.resolveEffective('org-a', {
      permissions: ['subscription.view', 'subscription.billing-evidence.submit'],
    });
    expect(control(defaults, 'billing.actions.submit')).toMatchObject({
      override: null,
      configuredValue: { allowed: true },
      effectiveValue: { allowed: true },
    });

    await capabilityService.updatePolicy(
      'org-a',
      { expectedVersion: 0, changes: [{ key: 'billing', value: { enabled: false } }] },
      { actorId: 'platform-admin' },
    );
    const restricted = await capabilityService.resolveEffective('org-a', {
      permissions: ['subscription.view', 'subscription.billing-evidence.submit'],
    });
    expect(control(restricted, 'billing').effectiveValue.enabled).toBe(false);
    expect(control(restricted, 'billing.actions.submit').effectiveValue.allowed).toBe(false);
    expect(control(restricted, 'billing.actions.submit').reasons).toContain('parent_disabled');
  });

  it('keeps RBAC authoritative and preserves suspended Billing access', async () => {
    const active = createHarness();
    const viewOnly = await active.capabilityService.resolveEffective('org-a', {
      permissions: ['subscription.view'],
    });
    expect(control(viewOnly, 'billing').effectiveValue.enabled).toBe(true);
    expect(control(viewOnly, 'billing.actions.submit').effectiveValue.allowed).toBe(false);
    expect(control(viewOnly, 'billing.actions.submit').reasons).toContain('permission_denied');

    const suspended = createHarness('suspended');
    const effective = await suspended.capabilityService.resolveEffective('org-a', {
      permissions: ['subscription.view', 'subscription.billing-evidence.submit'],
    });
    expect(effective.operationalAllowed).toBe(false);
    expect(control(effective, 'billing').effectiveValue.enabled).toBe(true);
    expect(control(effective, 'billing.actions.submit').effectiveValue.allowed).toBe(true);
  });

  it('rejects attempts to hide required Billing inputs', async () => {
    const { capabilityService } = createHarness();
    await expect(
      capabilityService.updatePolicy(
        'org-a',
        {
          expectedVersion: 0,
          changes: [{ key: 'billing.fields.evidence', value: { visible: false } }],
        },
        { actorId: 'platform-admin' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('isolates organizations and resets only sparse Billing overrides with audit evidence', async () => {
    const { capabilityService, auditStore } = createHarness();
    await capabilityService.updatePolicy(
      'org-a',
      {
        expectedVersion: 0,
        changes: [
          { key: 'billing.actions.submit', value: { allowed: false } },
          { key: 'warehouses.features.search', value: { enabled: false } },
        ],
      },
      { actorId: 'platform-admin' },
    );

    expect(
      control(await capabilityService.resolveEffective('org-b'), 'billing.actions.submit')
        .effectiveValue.allowed,
    ).toBe(true);

    const reset = await capabilityService.resetModule(
      'org-a',
      'billing',
      1,
      { actorId: 'platform-admin' },
      'Restore Billing defaults',
    );
    expect(reset.version).toBe(2);
    expect(control(reset, 'billing.actions.submit').override).toBeNull();
    expect(control(reset, 'warehouses.features.search').override).toEqual({ enabled: false });
    expect(auditStore.listForTest().at(-1)).toMatchObject({
      organizationId: 'org-a',
      metadata: { controlKey: 'billing.actions.submit', versionBefore: 1, versionAfter: 2 },
    });
  });
});
