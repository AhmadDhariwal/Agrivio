const { forbidden } = require('../../platform/errors/app-error');

// Centralized plan creation-limit hard-block + soft-warning helper.
// Creates count via each module's store count; updates/deactivate/reactivate do not.
// Hard block only on reason === 'limit_reached'; soft warning at limit.softWarning.
async function assertCreationLimit(evaluateEntitlement, organizationId, limitKey, currentUsage) {
  if (typeof evaluateEntitlement !== 'function') {
    return undefined;
  }
  const result = await evaluateEntitlement(organizationId, {
    label: 'operational+limit',
    limitKey,
    currentUsage,
  });
  if (!result.allowed && result.reason === 'limit_reached') {
    throw forbidden(`Plan limit reached for ${limitKey}`, [
      { limitKey, reason: result.reason, ...(result.limit ?? {}) },
    ]);
  }
  return result;
}

function attachSoftWarning(dto, entitlementResult) {
  if (entitlementResult?.limit?.softWarning === true) {
    return { ...dto, softWarning: entitlementResult.limit };
  }
  return dto;
}

module.exports = {
  assertCreationLimit,
  attachSoftWarning,
};
