const SUPER_ADMIN_PERMISSIONS = Object.freeze([
  'platform.organizations.view',
  'platform.organizations.create',
  'platform.organizations.approve',
  'platform.organizations.suspend',
  'platform.subscriptions.manage',
  'platform.billing.verify',
  'platform.audit.view',
  'operations.backups.view',
  'operations.restore.execute',
]);

/**
 * Minimal Owner bundle for session snapshots until full RBAC (R1-F02-008).
 */
const OWNER_PERMISSIONS = Object.freeze([
  'organization.view',
  'organization.settings.manage',
  'users.manage',
  'inventory.view',
  'sales.create',
  'purchases.create',
  'reports.view',
  'audit.view',
]);

function permissionsForPlatformAccess(platformAccess) {
  return platformAccess === 'super_admin' ? SUPER_ADMIN_PERMISSIONS : [];
}

function permissionsForMembershipRole(role, conditionalPermissionGrants = []) {
  const base = role === 'Owner' ? OWNER_PERMISSIONS : [];
  return Object.freeze([...new Set([...base, ...conditionalPermissionGrants])]);
}

module.exports = {
  SUPER_ADMIN_PERMISSIONS,
  OWNER_PERMISSIONS,
  permissionsForPlatformAccess,
  permissionsForMembershipRole,
};
