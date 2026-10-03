const { R1_CATALOG_ID, R1_PLAN_CATALOG, r1PlanPayload } = require('./r1-plan-catalog');

const COMPARISON_PATHS = Object.freeze([
  'displayName',
  'shortDescription',
  'targetCustomer',
  'catalogRevision',
  'currency',
  'monthlyPriceMinorUnits',
  'annualPriceMinorUnits',
  'trialEligible',
  'limits.products',
  'limits.activeUsers',
  'limits.branches',
  'limits.warehouses',
  'limits.customers',
  'limits.suppliers',
  'entitlements.imports',
  'entitlements.reportsExports',
  'entitlements.auditHistory',
  'entitlements.backupPolicyRef',
  'entitlements.dedicatedCloudEligible',
  'entitlements.supportLevelRef',
]);

function valueAt(record, path) {
  return path.split('.').reduce((value, key) => value?.[key], record);
}

function inspectPlan(active, desired) {
  if (active === null) {
    return {
      planCode: desired.planCode,
      currentVersion: null,
      currentStatus: null,
      referenced: false,
      differences: ['missing active version'],
      proposedAction: 'create_and_activate',
    };
  }
  const differences = COMPARISON_PATHS.filter(
    (path) => valueAt(active, path) !== valueAt(desired, path),
  );
  return {
    planCode: desired.planCode,
    currentVersion: Number(active.planVersion),
    currentStatus: active.status,
    referenced: Boolean(active.referencedAt),
    differences,
    proposedAction: differences.length === 0 ? 'none' : 'create_next_version_and_activate',
  };
}

async function inspectR1Catalog(store) {
  const rows = [];
  for (const catalogPlan of R1_PLAN_CATALOG) {
    const desired = r1PlanPayload(catalogPlan);
    const active = await store.findActivePlanByCode(desired.planCode);
    rows.push(inspectPlan(active, desired));
  }
  return rows;
}

async function syncR1Catalog({ store, subscriptionService, dryRun, actorId }) {
  const before = await inspectR1Catalog(store);
  const actions = [];
  for (const row of before) {
    if (row.proposedAction === 'none') {
      actions.push({ planCode: row.planCode, action: 'none', planVersion: row.currentVersion });
      continue;
    }
    if (dryRun) {
      actions.push({ planCode: row.planCode, action: row.proposedAction, applied: false });
      continue;
    }
    const desired = R1_PLAN_CATALOG.find((plan) => plan.planCode === row.planCode);
    const created = await subscriptionService.createPlanVersion(
      { ...r1PlanPayload(desired), activate: true },
      { actorId },
    );
    actions.push({
      planCode: row.planCode,
      action: row.proposedAction,
      applied: true,
      planVersion: created.planVersion,
    });
  }
  return {
    catalogRevision: R1_CATALOG_ID,
    dryRun,
    plans: before,
    actions,
  };
}

module.exports = {
  COMPARISON_PATHS,
  inspectR1Catalog,
  syncR1Catalog,
};
