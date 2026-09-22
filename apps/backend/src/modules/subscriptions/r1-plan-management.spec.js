import { describe, expect, it } from 'vitest';
import { createSubscriptionModule } from './subscription.module';
import {
  R1_CATALOG_ID,
  R1_PLAN_CATALOG,
  r1PlanPayload,
} from './r1-plan-catalog';
import { inspectR1Catalog, syncR1Catalog } from './plan-catalog-sync';

const actor = { actorId: 'super-admin' };

function completePlan(planCode, overrides = {}) {
  const catalog = R1_PLAN_CATALOG.find((plan) => plan.planCode === planCode);
  return {
    ...r1PlanPayload(catalog),
    ...overrides,
    limits: { ...catalog.limits, ...(overrides.limits ?? {}) },
    entitlements: { ...catalog.entitlements, ...(overrides.entitlements ?? {}) },
  };
}

describe('R1 plan management and catalog synchronization', () => {
  for (const planCode of ['Starter', 'Business', 'Enterprise']) {
    it(`rejects activation of incomplete ${planCode}`, async () => {
      const { subscriptionService } = createSubscriptionModule({ persistence: 'memory' });
      await expect(
        subscriptionService.createPlanVersion({ planCode, activate: true }, actor),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Active R1 plan is incomplete or inconsistent',
      });
    });
  }

  it('allows an incomplete draft but rejects activating it', async () => {
    const { subscriptionService } = createSubscriptionModule({ persistence: 'memory' });
    const draft = await subscriptionService.createPlanVersion(
      { planCode: 'Starter', activate: false },
      actor,
    );
    expect(draft.status).toBe('draft');
    await expect(
      subscriptionService.activatePlanVersion('Starter', draft.planVersion, {
        expectedVersion: draft.version,
      }, actor),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('edits only unreferenced drafts and derives annual savings from prices', async () => {
    const { subscriptionService } = createSubscriptionModule({ persistence: 'memory' });
    const draft = await subscriptionService.createPlanVersion(
      { ...completePlan('Business'), activate: false },
      actor,
    );
    const updated = await subscriptionService.updateDraftPlan(
      'Business',
      draft.planVersion,
      { ...completePlan('Business'), expectedVersion: draft.version },
      actor,
    );
    const active = await subscriptionService.activatePlanVersion(
      'Business',
      updated.planVersion,
      { expectedVersion: updated.version },
      actor,
    );
    expect(active).toMatchObject({
      status: 'active',
      annualDiscountPercent: 16.67,
      annualSavingsMinorUnits: 3000000,
      selectable: true,
    });
    await expect(
      subscriptionService.updateDraftPlan(
        'Business',
        active.planVersion,
        { ...completePlan('Business'), expectedVersion: active.version },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('creates a new active version without changing a pinned subscription', async () => {
    const { store, subscriptionService } = createSubscriptionModule({ persistence: 'memory' });
    const v1 = await subscriptionService.createPlanVersion(
      { ...completePlan('Starter'), activate: true },
      actor,
    );
    await store.insertSubscription(null, {
      organizationId: 'org-1',
      planId: v1.id,
      planCode: 'Starter',
      planVersion: v1.planVersion,
      status: 'trial',
      version: 1,
    });
    const v2 = await subscriptionService.createPlanVersion(
      { ...completePlan('Starter', { limits: { products: 250 } }), activate: true },
      actor,
    );
    const subscription = await store.findSubscriptionByOrganizationId('org-1');
    expect(v2.planVersion).toBe(2);
    expect(subscription).toMatchObject({ planId: v1.id, planVersion: 1 });
    await expect(subscriptionService.assertPlanImmutable('Starter', 1)).resolves.toBeTruthy();
  });

  it('retires active versions without deleting history', async () => {
    const { store, subscriptionService } = createSubscriptionModule({ persistence: 'memory' });
    const active = await subscriptionService.createPlanVersion(
      { ...completePlan('Enterprise'), activate: true },
      actor,
    );
    const retired = await subscriptionService.retirePlanVersion(
      'Enterprise',
      active.planVersion,
      { expectedVersion: active.version, reason: 'Commercial catalog retired' },
      actor,
    );
    expect(retired.status).toBe('superseded');
    expect(await store.findPlanByCodeVersion('Enterprise', 1)).not.toBeNull();
  });

  it('dry-runs without mutation and detects missing Enterprise', async () => {
    const { store, subscriptionService } = createSubscriptionModule({ persistence: 'memory' });
    for (const code of ['Starter', 'Business']) {
      await subscriptionService.createPlanVersion(
        { ...completePlan(code), activate: true },
        actor,
      );
    }
    const result = await syncR1Catalog({
      store,
      subscriptionService,
      dryRun: true,
      actorId: actor.actorId,
    });
    expect(result.plans.find((plan) => plan.planCode === 'Enterprise')).toMatchObject({
      differences: ['missing active version'],
      proposedAction: 'create_and_activate',
    });
    expect(await store.findActivePlanByCode('Enterprise')).toBeNull();
  });

  it('bootstraps exactly three active plans and is idempotent', async () => {
    const { store, subscriptionService } = createSubscriptionModule({ persistence: 'memory' });
    await syncR1Catalog({
      store,
      subscriptionService,
      dryRun: false,
      actorId: actor.actorId,
    });
    const active = await store.listPlans({ status: 'active' });
    expect(active).toHaveLength(3);
    expect(active.map((plan) => plan.planCode).sort()).toEqual([
      'Business',
      'Enterprise',
      'Starter',
    ]);
    expect(active.every((plan) => plan.catalogRevision === R1_CATALOG_ID)).toBe(true);
    const second = await syncR1Catalog({
      store,
      subscriptionService,
      dryRun: false,
      actorId: actor.actorId,
    });
    expect(second.actions.every((action) => action.action === 'none')).toBe(true);
    expect(await store.listPlans()).toHaveLength(3);
  });

  it('replaces a malformed referenced active plan with a new version', async () => {
    const { store, subscriptionService } = createSubscriptionModule({ persistence: 'memory' });
    const malformed = await store.insertPlan(null, {
      ...completePlan('Starter'),
      limits: { ...completePlan('Starter').limits, products: null },
      planVersion: 1,
      status: 'active',
      referencedAt: new Date().toISOString(),
      version: 1,
    });
    await syncR1Catalog({
      store,
      subscriptionService,
      dryRun: false,
      actorId: actor.actorId,
    });
    const old = await store.findPlanById(malformed._id);
    const current = await store.findActivePlanByCode('Starter');
    expect(old.limits.products).toBeNull();
    expect(old.status).toBe('superseded');
    expect(current).toMatchObject({ planVersion: 2, limits: { products: 200 } });
    expect((await inspectR1Catalog(store)).every((plan) => plan.differences.length === 0)).toBe(true);
  });
});
