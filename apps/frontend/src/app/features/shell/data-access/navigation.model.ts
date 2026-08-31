export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly permission?: string | undefined;
  readonly capabilityKey?: string | undefined;
  readonly actionCapabilityKey?: string | undefined;
  readonly testId?: string | undefined;
  readonly exact?: boolean | undefined;
}

export interface NavGroup {
  readonly id: string;
  readonly label: string;
  readonly icon?: string | undefined;
  readonly contextType?: 'organization' | 'platform' | undefined;
  readonly children: readonly NavItem[];
}

export type NavEntry =
  | { readonly type: 'item'; readonly item: NavItem }
  | { readonly type: 'group'; readonly group: NavGroup };

export interface VisibleNavGroup {
  readonly id: string;
  readonly label: string;
  readonly icon?: string | undefined;
  readonly children: readonly NavItem[];
}

export type VisibleNavEntry =
  | { readonly type: 'item'; readonly item: NavItem }
  | { readonly type: 'group'; readonly group: VisibleNavGroup };

export interface NavCustomizerGroupItem {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly visible: boolean;
}

export interface NavCustomizerGroup {
  readonly id: string;
  readonly label: string;
  readonly state: 'checked' | 'unchecked' | 'indeterminate';
  readonly items: readonly NavCustomizerGroupItem[];
}

export type NavCustomizerEntry =
  | { readonly type: 'item'; readonly item: NavCustomizerGroupItem }
  | { readonly type: 'group'; readonly group: NavCustomizerGroup };

export interface NavCustomizerTree {
  readonly entries: readonly NavCustomizerEntry[];
  readonly isFiltered: boolean;
}

export interface NavigationPreferences {
  readonly hiddenItemIds: readonly string[];
  readonly groupOrder: readonly string[];
  readonly itemOrderByGroup: Readonly<Record<string, readonly string[]>>;
}

/**
 * Authoritative canonical Release 1 Agrivio navigation hierarchy.
 * Permissions are preserved exactly from existing route guards and shell definitions.
 */
export const CANONICAL_NAVIGATION: readonly NavEntry[] = [
  {
    type: 'item',
    item: {
      id: 'dashboard',
      label: 'Dashboard',
      route: '/app/dashboard',
      permission: 'dashboard.view',
      capabilityKey: 'dashboard',
      testId: 'nav-dashboard',
    },
  },
  {
    type: 'group',
    group: {
      id: 'sales',
      label: 'Sales',
      children: [
        {
          id: 'sales.new',
          label: 'POS / New sale',
          route: '/app/sales/new',
          permission: 'sales.view',
          capabilityKey: 'sales',
          actionCapabilityKey: 'sales.actions.createDraft',
        },
        {
          id: 'sales.history',
          label: 'Sales',
          route: '/app/sales',
          permission: 'sales.view',
          capabilityKey: 'sales',
          testId: 'nav-sales',
          exact: true,
        },
        {
          id: 'sales.customer-payments',
          label: 'Customer payments',
          route: '/app/customer-payments',
          permission: 'customer-payments.view',
          capabilityKey: 'payments.customer',
          testId: 'nav-customer-payments',
        },
      ],
    },
  },
  {
    type: 'group',
    group: {
      id: 'purchases',
      label: 'Purchases',
      children: [
        {
          id: 'purchases.list',
          label: 'Purchases',
          route: '/app/purchases',
          permission: 'purchases.view',
          capabilityKey: 'purchases',
          testId: 'nav-purchases',
          exact: true,
        },
        {
          id: 'purchases.supplier-payments',
          label: 'Supplier payments',
          route: '/app/supplier-payments',
          permission: 'supplier-payments.view',
          capabilityKey: 'payments.supplier',
          testId: 'nav-supplier-payments',
          exact: true,
        },
        {
          id: 'purchases.supplier-ledger',
          label: 'Supplier ledger',
          route: '/app/supplier-payments/ledger',
          permission: 'supplier-payments.view',
          capabilityKey: 'payments.supplierLedger',
          testId: 'nav-supplier-ledger',
        },
      ],
    },
  },
  {
    type: 'group',
    group: {
      id: 'inventory',
      label: 'Inventory',
      children: [
        {
          id: 'inventory.products',
          label: 'Products',
          route: '/app/products',
          permission: 'catalog.view',
          capabilityKey: 'inventory.products',
          testId: 'nav-products',
        },
        {
          id: 'inventory.categories',
          label: 'Categories',
          route: '/app/categories',
          permission: 'catalog.view',
          capabilityKey: 'inventory.categories',
          testId: 'nav-categories',
        },
        {
          id: 'inventory.stock',
          label: 'Inventory',
          route: '/app/inventory/stock',
          permission: 'inventory.view',
          capabilityKey: 'inventory.stock',
          testId: 'nav-inventory',
          exact: true,
        },
        {
          id: 'inventory.opening-stock',
          label: 'Opening stock',
          route: '/app/inventory/opening-stock',
          permission: 'inventory.opening-stock.post',
          capabilityKey: 'inventory.openingStock',
          testId: 'nav-opening-stock',
        },
        {
          id: 'inventory.batches',
          label: 'Batches',
          route: '/app/inventory/batches',
          permission: 'inventory.view',
          capabilityKey: 'inventory.batches',
          testId: 'nav-batches',
        },
        {
          id: 'inventory.expiry',
          label: 'Expiry',
          route: '/app/inventory/expiry',
          permission: 'inventory.view',
          capabilityKey: 'inventory.expiry',
          testId: 'nav-expiry',
        },
        {
          id: 'inventory.adjustments',
          label: 'Adjustments',
          route: '/app/inventory/adjustments',
          permission: 'inventory.adjust',
          capabilityKey: 'inventory.adjustments',
          testId: 'nav-adjustments',
        },
        {
          id: 'inventory.transfers',
          label: 'Transfers',
          route: '/app/inventory/transfers',
          permission: 'inventory.transfer',
          capabilityKey: 'inventory.transfers',
          testId: 'nav-transfers',
        },
        {
          id: 'inventory.reconciliation',
          label: 'Reconciliation',
          route: '/app/inventory/reconciliation',
          permission: 'inventory.adjust',
          capabilityKey: 'inventory.reconciliation',
          testId: 'nav-reconciliation',
        },
        {
          id: 'inventory.movements',
          label: 'Stock movements',
          route: '/app/inventory/movements',
          permission: 'inventory.view',
          capabilityKey: 'inventory.movements',
          testId: 'nav-movements',
        },
      ],
    },
  },
  {
    type: 'group',
    group: {
      id: 'partners',
      label: 'Customers & Suppliers',
      children: [
        {
          id: 'partners.customers',
          label: 'Customers',
          route: '/app/customers',
          permission: 'customers.view',
          capabilityKey: 'customers',
          testId: 'nav-customers',
        },
        {
          id: 'partners.suppliers',
          label: 'Suppliers',
          route: '/app/suppliers',
          permission: 'suppliers.view',
          capabilityKey: 'suppliers',
          testId: 'nav-suppliers',
        },
      ],
    },
  },
  {
    type: 'group',
    group: {
      id: 'returns',
      label: 'Returns & Corrections',
      children: [
        {
          id: 'returns.list',
          label: 'Returns',
          route: '/app/returns',
          permission: 'returns.view',
          capabilityKey: 'returns',
          testId: 'nav-returns',
          exact: true,
        },
        {
          id: 'returns.without-invoice',
          label: 'Return without invoice',
          route: '/app/returns/without-invoice',
          permission: 'returns.view',
          capabilityKey: 'returns',
          testId: 'nav-without-invoice',
        },
      ],
    },
  },
  {
    type: 'group',
    group: {
      id: 'finance',
      label: 'Finance',
      children: [
        {
          id: 'finance.expenses',
          label: 'Expenses',
          route: '/app/expenses',
          permission: 'expenses.view',
          capabilityKey: 'expenses',
          testId: 'nav-expenses',
          exact: true,
        },
        {
          id: 'finance.expense-categories',
          label: 'Expense categories',
          route: '/app/expense-categories',
          permission: 'expenses.view',
          capabilityKey: 'expenses.categories',
          testId: 'nav-expense-categories',
        },
        {
          id: 'finance.accounts',
          label: 'Accounts',
          route: '/app/accounts',
          permission: 'accounts.view',
          capabilityKey: 'accounts',
          testId: 'nav-accounts',
        },
      ],
    },
  },
  {
    type: 'group',
    group: {
      id: 'insights',
      label: 'Reports & Insights',
      children: [
        {
          id: 'insights.reports',
          label: 'Reports',
          route: '/app/reports',
          permission: 'reports.view',
          capabilityKey: 'reports',
          testId: 'nav-reports',
        },
        {
          id: 'insights.alerts',
          label: 'Alerts',
          route: '/app/alerts',
          permission: 'alerts.view',
          capabilityKey: 'alerts',
          testId: 'nav-alerts',
        },
      ],
    },
  },
  {
    type: 'group',
    group: {
      id: 'organization',
      label: 'Organization',
      children: [
        {
          id: 'organization.branches',
          label: 'Branches',
          route: '/app/branches',
          permission: 'branches.view',
          capabilityKey: 'branches',
          testId: 'nav-branches',
        },
        {
          id: 'organization.warehouses',
          label: 'Warehouses',
          route: '/app/warehouses',
          permission: 'warehouses.manage',
          capabilityKey: 'warehouses',
          testId: 'nav-warehouses',
        },
        {
          id: 'organization.employees',
          label: 'Employees',
          route: '/app/employees',
          permission: 'users.view',
          capabilityKey: 'employees',
          testId: 'nav-employees',
        },
        {
          id: 'organization.settings',
          label: 'Settings',
          route: '/app/organization/settings',
          permission: 'settings.view',
          testId: 'nav-settings',
        },
        {
          id: 'organization.setup',
          label: 'Setup',
          route: '/app/organization/setup',
          permission: 'settings.view',
          capabilityKey: 'setup',
          testId: 'nav-setup',
        },
        {
          id: 'organization.billing',
          label: 'Billing',
          route: '/app/subscription/billing',
          permission: 'subscription.billing-evidence.submit',
          capabilityKey: 'billing',
          testId: 'nav-billing',
        },
      ],
    },
  },
  {
    type: 'group',
    group: {
      id: 'operations',
      label: 'Data & Operations',
      children: [
        {
          id: 'operations.imports',
          label: 'Imports',
          route: '/app/imports',
          permission: 'imports.preview',
          testId: 'nav-imports',
        },
        {
          id: 'operations.audit',
          label: 'Audit',
          route: '/app/audit',
          permission: 'audit.view',
          testId: 'nav-audit',
        },
      ],
    },
  },
  {
    type: 'group',
    group: {
      id: 'platform',
      label: 'Platform Administration',
      contextType: 'platform',
      children: [
        {
          id: 'platform.organizations',
          label: 'Organizations',
          route: '/app/platform/organizations',
          permission: 'platform.organizations.view',
          testId: 'nav-platform-organizations',
        },
        {
          id: 'platform.plans',
          label: 'Plans',
          route: '/app/platform/plans',
          permission: 'platform.subscriptions.manage',
          testId: 'nav-platform-plans',
        },
        {
          id: 'platform.billing-review',
          label: 'Billing review',
          route: '/app/platform/billing-review',
          permission: 'platform.billing.verify',
          testId: 'nav-platform-billing-review',
        },
        {
          id: 'platform.operations',
          label: 'Backup status',
          route: '/app/platform/operations',
          permission: 'operations.backups.view',
          testId: 'nav-operations',
        },
      ],
    },
  },
];
