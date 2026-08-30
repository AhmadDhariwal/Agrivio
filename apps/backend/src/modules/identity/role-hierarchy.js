const { roleHierarchyDenied } = require('../../platform/errors/app-error');

const ORGANIZATION_ROLES = Object.freeze(['Owner', 'Manager', 'Cashier', 'StoreKeeper']);
const MANAGER_SUBORDINATE_ROLES = Object.freeze(['Cashier', 'StoreKeeper']);

const ROLE_DESCRIPTIONS = Object.freeze({
  Owner: 'Full organization administrator with access to all tenant operations and settings.',
  Manager:
    'Runs day-to-day operations and can manage Cashiers and Store Keepers within assigned locations.',
  Cashier: 'POS-focused role for sales, customer payments, and required read-only operational data.',
  StoreKeeper:
    'Warehouse-focused role for inventory, transfers, purchasing, expiry, and supplier operations.',
});

function isOrganizationRole(role) {
  return ORGANIZATION_ROLES.includes(role);
}

function assignableRolesForActor(actorRole) {
  if (actorRole === 'Owner') {
    return ORGANIZATION_ROLES;
  }
  if (actorRole === 'Manager') {
    return MANAGER_SUBORDINATE_ROLES;
  }
  return Object.freeze([]);
}

function canManageOrganizationRole(actorRole, targetRole) {
  if (!isOrganizationRole(actorRole) || !isOrganizationRole(targetRole)) {
    return false;
  }
  if (actorRole === 'Owner') {
    return true;
  }
  if (actorRole === 'Manager') {
    return MANAGER_SUBORDINATE_ROLES.includes(targetRole);
  }
  return false;
}

function assertCanAssignRole(actorRole, targetRole) {
  if (!isOrganizationRole(targetRole)) {
    throw roleHierarchyDenied('Organization users cannot be granted platform Super Admin access');
  }
  if (!canManageOrganizationRole(actorRole, targetRole)) {
    throw roleHierarchyDenied(
      actorRole === 'Manager'
        ? 'Managers can only create or assign Cashier and Store Keeper roles.'
        : 'You cannot assign this organization role.',
    );
  }
}

function assertCanManageMembership(actorRole, targetRole) {
  if (!canManageOrganizationRole(actorRole, targetRole)) {
    throw roleHierarchyDenied(
      actorRole === 'Manager'
        ? 'Managers can only manage Cashiers and Store Keepers.'
        : 'You cannot manage this employee.',
    );
  }
}

function canManageConditionalGrants(actorRole) {
  return actorRole === 'Owner';
}

function assertCanManageConditionalGrants(actorRole) {
  if (!canManageConditionalGrants(actorRole)) {
    throw roleHierarchyDenied('Only an Owner can manage additional permissions.');
  }
}

module.exports = {
  ORGANIZATION_ROLES,
  MANAGER_SUBORDINATE_ROLES,
  ROLE_DESCRIPTIONS,
  isOrganizationRole,
  assignableRolesForActor,
  canManageOrganizationRole,
  assertCanAssignRole,
  assertCanManageMembership,
  canManageConditionalGrants,
  assertCanManageConditionalGrants,
};
