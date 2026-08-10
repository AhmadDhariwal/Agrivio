/**
 * Guided organization setup progress — derived from persisted F03 state.
 * No dedicated setup collection.
 */

function hasPermission(authContext, permission) {
  const permissions = authContext?.permissions;
  if (!Array.isArray(permissions)) {
    return false;
  }
  return permissions.includes(permission);
}

function stepStatus(complete, allowed) {
  if (!allowed) {
    return 'blocked';
  }
  return complete ? 'complete' : 'incomplete';
}

function createSetupProgressService(deps) {
  return {
    async getSetupProgress(organizationId, authContext) {
      const [
        organization,
        settings,
        branchCount,
        warehouseCount,
        membershipCount,
        categoryCount,
        productCount,
        packagingCount,
        priceCount,
        customerCount,
        supplierCount,
        accountCount,
        customersWithOpening,
        suppliersWithOpening,
        accountsWithOpening,
      ] = await Promise.all([
        deps.findOrganizationById(organizationId),
        deps.findSettingsByOrganizationId(organizationId),
        deps.countBranches(organizationId),
        deps.countWarehouses(organizationId),
        deps.countActiveMemberships(organizationId),
        deps.countCategories(organizationId),
        deps.countProducts(organizationId),
        deps.countPackagingUnits(organizationId),
        deps.countProductPrices(organizationId),
        deps.countCustomers(organizationId),
        deps.countSuppliers(organizationId),
        deps.countAccounts(organizationId),
        deps.countCustomersWithOpening(organizationId),
        deps.countSuppliersWithOpening(organizationId),
        deps.countAccountsWithOpening(organizationId),
      ]);

      const orgHasName =
        organization !== null &&
        typeof organization.name === 'string' &&
        organization.name.trim() !== '';
      const settingsExists = settings !== null;
      const profileComplete = orgHasName && settingsExists;

      const accessComplete = membershipCount >= 1;
      const catalogComplete = categoryCount >= 1 && productCount >= 1;
      const packagingComplete = packagingCount >= 1;
      const pricingComplete = priceCount >= 1;

      const customerOpeningsComplete = customerCount === 0 || customersWithOpening >= 1;
      const supplierOpeningsComplete = supplierCount === 0 || suppliersWithOpening >= 1;
      const accountOpeningsComplete = accountCount === 0 || accountsWithOpening >= 1;
      const openingsComplete =
        customerOpeningsComplete && supplierOpeningsComplete && accountOpeningsComplete;

      const steps = [
        {
          id: 'organization_profile',
          title: 'Organization profile & settings',
          status: stepStatus(profileComplete, hasPermission(authContext, 'settings.view')),
          href: '/app/organization/settings',
          permission: 'settings.view',
        },
        {
          id: 'branch',
          title: 'Create a branch',
          status: stepStatus(branchCount >= 1, hasPermission(authContext, 'branches.view')),
          href: '/app/branches',
          permission: 'branches.view',
        },
        {
          id: 'warehouse',
          title: 'Create a warehouse',
          status: stepStatus(warehouseCount >= 1, hasPermission(authContext, 'warehouses.view')),
          href: '/app/warehouses',
          permission: 'warehouses.view',
        },
        {
          id: 'employees_access',
          title: 'Employees & access',
          status: stepStatus(accessComplete, hasPermission(authContext, 'users.view')),
          href: '/app/employees',
          permission: 'users.view',
        },
        {
          id: 'catalog',
          title: 'Categories & products',
          status: stepStatus(catalogComplete, hasPermission(authContext, 'catalog.view')),
          href: '/app/categories',
          permission: 'catalog.view',
        },
        {
          id: 'packaging',
          title: 'Units & packaging',
          status: stepStatus(packagingComplete, hasPermission(authContext, 'catalog.view')),
          href: '/app/products',
          permission: 'catalog.view',
        },
        {
          id: 'pricing',
          title: 'Product pricing',
          status: stepStatus(pricingComplete, hasPermission(authContext, 'catalog.view')),
          href: '/app/products',
          permission: 'catalog.view',
        },
        {
          id: 'customers',
          title: 'Customers',
          status: stepStatus(customerCount >= 1, hasPermission(authContext, 'customers.view')),
          href: '/app/customers',
          permission: 'customers.view',
        },
        {
          id: 'suppliers',
          title: 'Suppliers',
          status: stepStatus(supplierCount >= 1, hasPermission(authContext, 'suppliers.view')),
          href: '/app/suppliers',
          permission: 'suppliers.view',
        },
        {
          id: 'accounts',
          title: 'Accounts',
          status: stepStatus(accountCount >= 1, hasPermission(authContext, 'accounts.view')),
          href: '/app/accounts',
          permission: 'accounts.view',
        },
        {
          id: 'opening_balances',
          title: 'Opening balances',
          status: stepStatus(
            openingsComplete,
            hasPermission(authContext, 'customers.opening-balance.post') ||
              hasPermission(authContext, 'suppliers.opening-balance.post') ||
              hasPermission(authContext, 'accounts.opening-balance.post') ||
              hasPermission(authContext, 'customers.view'),
          ),
          href: '/app/customers',
          permission: 'customers.opening-balance.post',
        },
      ];

      const readyForOperations = steps.every((step) => step.status === 'complete');

      return {
        steps,
        readyForOperations,
        notes: ['Inventory/Purchases/Sales not in scope yet'],
      };
    },
  };
}

module.exports = {
  createSetupProgressService,
};
