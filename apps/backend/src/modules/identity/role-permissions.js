const PERMISSION_CATALOG = Object.freeze([
  'platform.organizations.view',
  'platform.organizations.create',
  'platform.organizations.approve',
  'platform.organizations.suspend',
  'platform.subscriptions.manage',
  'platform.billing.verify',
  'platform.audit.view',
  'operations.backups.view',
  'operations.restore.execute',
  'organization.view',
  'organization.update',
  'users.view',
  'users.create',
  'users.update',
  'users.deactivate',
  'users.assign-access',
  'branches.view',
  'branches.manage',
  'warehouses.view',
  'warehouses.manage',
  'settings.view',
  'settings.manage',
  'subscription.view',
  'subscription.billing-evidence.submit',
  'catalog.view',
  'catalog.manage',
  'pricing.view',
  'pricing.manage',
  'pricing.override',
  'customers.view',
  'customers.manage',
  'customers.credit-policy.manage',
  'customers.opening-balance.post',
  'suppliers.view',
  'suppliers.manage',
  'suppliers.opening-balance.post',
  'inventory.view',
  'inventory.opening-stock.post',
  'inventory.adjust',
  'inventory.adjust.reverse',
  'inventory.transfer',
  'inventory.transfer.reverse',
  'inventory.negative-stock.override',
  'inventory.expiry.view',
  'purchases.view',
  'purchases.create',
  'purchases.post',
  'purchases.cancel',
  'purchases.return',
  'sales.view',
  'sales.create',
  'sales.post',
  'sales.cancel',
  'sales.expired-stock.approve',
  'sales.credit-limit.approve',
  'customer-payments.view',
  'customer-payments.post',
  'supplier-payments.view',
  'supplier-payments.post',
  'payments.correct',
  'accounts.view',
  'accounts.manage',
  'accounts.transfer',
  'accounts.transfer.reverse',
  'accounts.transaction.post',
  'accounts.transaction.correct',
  'accounts.opening-balance.post',
  'expenses.view',
  'expenses.post',
  'expenses.correct',
  'returns.view',
  'returns.post',
  'returns.without-invoice.approve',
  'returns.reverse',
  'alerts.view',
  'dashboard.view',
  'reports.view',
  'reports.export',
  'imports.preview',
  'imports.execute',
  'audit.view',
]);

const PERMISSION_SET = new Set(PERMISSION_CATALOG);

/**
 * Matrix cells: A = automatic, C = conditional grant only, N = never, P = platform-context only.
 * Source: SECURITY_AUTHORIZATION.md §9.6
 */
const ROLE_MATRIX = Object.freeze({
  'platform.organizations.view': {
    SuperAdmin: 'P',
    Owner: 'N',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'platform.organizations.create': {
    SuperAdmin: 'P',
    Owner: 'N',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'platform.organizations.approve': {
    SuperAdmin: 'P',
    Owner: 'N',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'platform.organizations.suspend': {
    SuperAdmin: 'P',
    Owner: 'N',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'platform.subscriptions.manage': {
    SuperAdmin: 'P',
    Owner: 'N',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'platform.billing.verify': {
    SuperAdmin: 'P',
    Owner: 'N',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'platform.audit.view': {
    SuperAdmin: 'P',
    Owner: 'N',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'operations.backups.view': {
    SuperAdmin: 'P',
    Owner: 'N',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'operations.restore.execute': {
    SuperAdmin: 'P',
    Owner: 'N',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'organization.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'A',
  },
  'organization.update': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'users.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'users.create': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'users.update': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'users.deactivate': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'users.assign-access': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'branches.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'A',
  },
  'branches.manage': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'warehouses.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'A',
  },
  'warehouses.manage': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'settings.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'settings.manage': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'subscription.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'A',
  },
  'subscription.billing-evidence.submit': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'catalog.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'A',
  },
  'catalog.manage': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'pricing.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'A',
  },
  'pricing.manage': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'pricing.override': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'C',
    StoreKeeper: 'N',
  },
  'customers.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'N',
  },
  'customers.manage': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'C',
    StoreKeeper: 'N',
  },
  'customers.credit-policy.manage': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'customers.opening-balance.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'C',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'suppliers.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'A',
  },
  'suppliers.manage': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'suppliers.opening-balance.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'C',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'inventory.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'A',
  },
  'inventory.opening-stock.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'C',
  },
  'inventory.adjust': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'C',
  },
  'inventory.adjust.reverse': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'C',
  },
  'inventory.transfer': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'A',
  },
  'inventory.transfer.reverse': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'C',
  },
  'inventory.negative-stock.override': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'N',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'inventory.expiry.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'A',
  },
  'purchases.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'A',
  },
  'purchases.create': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'A',
  },
  'purchases.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'A',
  },
  'purchases.cancel': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'purchases.return': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'A',
  },
  'sales.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'N',
  },
  'sales.create': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'N',
  },
  'sales.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'N',
  },
  'sales.cancel': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'sales.expired-stock.approve': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'sales.credit-limit.approve': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'customer-payments.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'N',
  },
  'customer-payments.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'N',
  },
  'supplier-payments.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'supplier-payments.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'payments.correct': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'accounts.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'accounts.manage': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'accounts.transfer': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'accounts.transfer.reverse': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'accounts.transaction.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'accounts.transaction.correct': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'accounts.opening-balance.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'C',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'expenses.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'expenses.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'expenses.correct': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'returns.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'C',
    StoreKeeper: 'C',
  },
  'returns.post': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'C',
    StoreKeeper: 'C',
  },
  'returns.without-invoice.approve': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'returns.reverse': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'C',
  },
  'alerts.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'A',
  },
  'dashboard.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'A',
    StoreKeeper: 'C',
  },
  'reports.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'reports.export': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'imports.preview': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'C',
  },
  'imports.execute': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'A',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
  'audit.view': {
    SuperAdmin: 'N',
    Owner: 'A',
    Manager: 'C',
    Cashier: 'N',
    StoreKeeper: 'N',
  },
});

const PLATFORM_ROLE = 'SuperAdmin';
const RESTORE_PERMISSION = 'operations.restore.execute';

function isKnownPermission(permission) {
  return typeof permission === 'string' && PERMISSION_SET.has(permission);
}

function matrixCell(permission, role) {
  const row = ROLE_MATRIX[permission];
  if (row === undefined) {
    return 'N';
  }
  return row[role] ?? 'N';
}

function permissionsForPlatformAccess(platformAccess, explicitGrants = []) {
  if (platformAccess !== 'super_admin') {
    return Object.freeze([]);
  }

  const granted = new Set();
  for (const permission of PERMISSION_CATALOG) {
    if (matrixCell(permission, PLATFORM_ROLE) !== 'P') {
      continue;
    }
    // Restore requires an explicit operational grant.
    if (permission === RESTORE_PERMISSION) {
      continue;
    }
    granted.add(permission);
  }

  for (const grant of explicitGrants) {
    if (
      isKnownPermission(grant) &&
      matrixCell(grant, PLATFORM_ROLE) === 'P' &&
      grant === RESTORE_PERMISSION
    ) {
      granted.add(grant);
    }
  }

  return Object.freeze([...granted]);
}

function permissionsForMembershipRole(role, conditionalPermissionGrants = []) {
  const granted = new Set();

  for (const permission of PERMISSION_CATALOG) {
    const cell = matrixCell(permission, role);
    if (cell === 'A') {
      granted.add(permission);
    }
  }

  for (const grant of conditionalPermissionGrants) {
    if (!isKnownPermission(grant)) {
      continue;
    }
    if (matrixCell(grant, role) === 'C') {
      granted.add(grant);
    }
  }

  return Object.freeze([...granted]);
}

function hasPermission(effectivePermissions, permission) {
  if (!isKnownPermission(permission)) {
    return false;
  }
  return Array.isArray(effectivePermissions) && effectivePermissions.includes(permission);
}

module.exports = {
  PERMISSION_CATALOG,
  ROLE_MATRIX,
  isKnownPermission,
  hasPermission,
  permissionsForPlatformAccess,
  permissionsForMembershipRole,
};
