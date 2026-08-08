const { conflict } = require('../../platform/errors/app-error');

function countActiveOwners(memberships) {
  return memberships.filter(
    (membership) => membership['status'] === 'active' && membership['role'] === 'Owner',
  ).length;
}

function assertOwnerPresence(memberships, message) {
  if (countActiveOwners(memberships) < 1) {
    throw conflict(message ?? 'Every active organization must retain at least one active Owner');
  }
}

function assertOwnerPresenceAfterMembershipChange(existingMemberships, membershipId, patch) {
  const next = existingMemberships.map((membership) => {
    if (String(membership['_id']) !== String(membershipId)) {
      return membership;
    }
    return { ...membership, ...patch };
  });
  assertOwnerPresence(next);
  return next;
}

module.exports = {
  countActiveOwners,
  assertOwnerPresence,
  assertOwnerPresenceAfterMembershipChange,
};
