const TRIAL_DAYS = 14;
const GRACE_DAYS = 7;

function daysFrom(value, days) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseRepairArguments(argv) {
  let organizationId = null;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--organization-id') {
      organizationId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!organizationId) {
    throw new Error('--organization-id <id> is required');
  }
  return { organizationId, dryRun };
}

function determineRepairLifecycle(organization, at = new Date()) {
  if (organization.status === 'pending_approval') {
    return { status: 'pending_approval', trialEndsAt: null, graceEndsAt: null };
  }
  if (organization.status === 'suspended') {
    return { status: 'suspended', trialEndsAt: null, graceEndsAt: null };
  }
  if (organization.status !== 'approved') {
    throw new Error(
      `Organization status ${organization.status} is not eligible for subscription repair`,
    );
  }
  const approvedAt = new Date(organization.approvedAt);
  if (Number.isNaN(approvedAt.getTime())) {
    throw new Error(
      'Approved organization has no valid approvedAt; explicit operator decision is required',
    );
  }
  const trialEndsAt = daysFrom(approvedAt, TRIAL_DAYS);
  const graceEndsAt = daysFrom(trialEndsAt, GRACE_DAYS);
  if (at.getTime() < trialEndsAt.getTime()) {
    return { status: 'trial', trialEndsAt, graceEndsAt: null };
  }
  if (at.getTime() < graceEndsAt.getTime()) {
    return { status: 'grace', trialEndsAt, graceEndsAt };
  }
  return { status: 'suspended', trialEndsAt, graceEndsAt };
}

function reportFor(organization, currentSubscription, plan, target, changed, dryRun, changeWouldOccur) {
  return {
    organizationId: String(organization._id),
    organizationStatus: organization.status,
    approvedAt: organization.approvedAt ? new Date(organization.approvedAt).toISOString() : null,
    currentSubscriptionState: currentSubscription?.status ?? null,
    selectedPlanCode: plan?.planCode ?? currentSubscription?.planCode ?? null,
    selectedPlanVersion: plan?.planVersion ?? currentSubscription?.planVersion ?? null,
    targetSubscriptionStatus: target.status,
    trialEndsAt: target.trialEndsAt?.toISOString() ?? null,
    graceEndsAt: target.graceEndsAt?.toISOString() ?? null,
    dryRun,
    changeWouldOccur,
    changed,
  };
}

async function repairOrganizationSubscription(options) {
  const organization = await options.store.findOrganizationById(options.organizationId);
  if (organization === null) throw new Error('Organization not found');
  const existing = await options.store.findSubscriptionByOrganizationId(options.organizationId);
  if (existing !== null) {
    return reportFor(
      organization,
      existing,
      null,
      {
        status: existing.status,
        trialEndsAt: existing.trialEndsAt ? new Date(existing.trialEndsAt) : null,
        graceEndsAt: existing.graceEndsAt ? new Date(existing.graceEndsAt) : null,
      },
      false,
      options.dryRun,
      false,
    );
  }
  const plan = await options.store.findActiveStarterPlan();
  if (plan === null) throw new Error('Active authoritative Starter plan was not found');
  const target = determineRepairLifecycle(organization, options.now ?? new Date());
  if (options.dryRun) return reportFor(organization, null, plan, target, false, true, true);

  let created = null;
  await options.store.runInTransaction(async (session) => {
    const rechecked = await options.store.findSubscriptionByOrganizationId(
      options.organizationId,
      session,
    );
    if (rechecked !== null) return;
    created = await options.store.insertSubscription(session, {
      organizationId: organization._id,
      status: target.status,
      planCode: plan.planCode,
      planVersion: plan.planVersion,
      planId: plan._id,
      trialEndsAt: target.trialEndsAt,
      graceEndsAt: target.graceEndsAt,
      version: 1,
    });
    if (target.status !== 'pending_approval' && options.store.markPlanReferenced) {
      await options.store.markPlanReferenced(session, plan, options.now ?? new Date());
    }
    await options.store.appendAuditEvent(session, {
      scope: 'platform',
      organizationId: String(organization._id),
      actorId: 'ops:repair-organization-subscription',
      action: 'subscription.repaired_missing_record',
      resourceType: 'subscription',
      resourceId: String(created._id),
      reason: 'Explicit operational repair of a missing subscription record',
      metadata: {
        organizationStatus: organization.status,
        targetStatus: target.status,
        planCode: plan.planCode,
        planVersion: plan.planVersion,
      },
      occurredAt: options.now ?? new Date(),
    });
  });
  const finalSubscription =
    created ?? (await options.store.findSubscriptionByOrganizationId(options.organizationId));
  return reportFor(
    organization,
    finalSubscription,
    plan,
    target,
    created !== null,
    false,
    created !== null,
  );
}

module.exports = {
  parseRepairArguments,
  determineRepairLifecycle,
  repairOrganizationSubscription,
};
