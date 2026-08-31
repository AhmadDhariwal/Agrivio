import { Route } from '@angular/router';
import {
  requirePlatformContextGuard,
  requireCapabilityGuard,
  requirePermissionGuard,
  requireSessionGuard,
} from './core/guards/session.guards';
import { AppShellPage } from './features/shell/pages/app-shell/app-shell.page';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./features/public/pages/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'context',
    canActivate: [requireSessionGuard],
    loadComponent: () =>
      import('./features/auth/pages/context-switcher/context-switcher.page').then(
        (m) => m.ContextSwitcherPage,
      ),
  },
  {
    path: 'password-reset',
    loadComponent: () =>
      import('./features/auth/pages/password-reset-request/password-reset-request.page').then(
        (m) => m.PasswordResetRequestPage,
      ),
  },
  {
    path: 'password-reset/confirm',
    loadComponent: () =>
      import('./features/auth/pages/password-reset-confirm/password-reset-confirm.page').then(
        (m) => m.PasswordResetConfirmPage,
      ),
  },
  {
    path: 'request-access',
    loadComponent: () =>
      import('./features/onboarding/pages/request-access/request-access.page').then(
        (m) => m.RequestAccessPage,
      ),
  },
  {
    path: 'activate',
    loadComponent: () =>
      import('./features/onboarding/pages/activate/activate.page').then((m) => m.ActivatePage),
  },
  {
    path: 'app',
    canActivate: [requireSessionGuard],
    component: AppShellPage,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/shell/pages/workspace-home/workspace-home.page').then(
            (m) => m.WorkspaceHomePage,
          ),
      },
      {
        path: 'dashboard',
        canActivate: [requirePermissionGuard('dashboard.view'), requireCapabilityGuard('dashboard')],
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard/dashboard.page').then(
            (m) => m.DashboardPage,
          ),
      },
      {
        path: 'alerts',
        canActivate: [requirePermissionGuard('alerts.view'), requireCapabilityGuard('alerts')],
        loadComponent: () =>
          import('./features/alerts/pages/notification-center/notification-center.page').then(
            (m) => m.NotificationCenterPage,
          ),
      },
      {
        path: 'reports',
        canActivate: [requirePermissionGuard('reports.view'), requireCapabilityGuard('reports')],
        loadComponent: () =>
          import('./features/reports/pages/reports/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'imports',
        canActivate: [requirePermissionGuard('imports.preview')],
        loadComponent: () =>
          import('./features/imports/pages/imports/imports.page').then((m) => m.ImportsPage),
      },
      {
        path: 'audit',
        canActivate: [requirePermissionGuard('audit.view')],
        loadComponent: () =>
          import('./features/audit/pages/audit-inquiry/audit-inquiry.page').then(
            (m) => m.AuditInquiryPage,
          ),
      },
      {
        path: 'subscription/billing',
        canActivate: [
          requirePermissionGuard('subscription.billing-evidence.submit'),
          requireCapabilityGuard('billing'),
        ],
        loadComponent: () =>
          import('./features/subscriptions/pages/billing-evidence/billing-evidence.page').then(
            (m) => m.BillingEvidencePage,
          ),
      },
      {
        path: 'platform/organizations',
        canActivate: [
          requirePlatformContextGuard,
          requirePermissionGuard('platform.organizations.view'),
        ],
        loadComponent: () =>
          import('./features/platform/pages/organizations-admin/organizations-admin.page').then(
            (m) => m.PlatformOrganizationsPage,
          ),
      },
      {
        path: 'platform/plans',
        canActivate: [
          requirePlatformContextGuard,
          requirePermissionGuard('platform.subscriptions.manage'),
        ],
        loadComponent: () =>
          import('./features/platform/pages/plans-admin/plans-admin.page').then(
            (m) => m.PlatformPlansPage,
          ),
      },
      {
        path: 'platform/billing-review',
        canActivate: [
          requirePlatformContextGuard,
          requirePermissionGuard('platform.billing.verify'),
        ],
        loadComponent: () =>
          import('./features/platform/pages/billing-review/billing-review.page').then(
            (m) => m.PlatformBillingReviewPage,
          ),
      },
      {
        path: 'platform/operations',
        canActivate: [
          requirePlatformContextGuard,
          requirePermissionGuard('operations.backups.view'),
        ],
        loadComponent: () =>
          import('./features/platform/pages/operations-status/operations-status.page').then(
            (m) => m.PlatformOperationsStatusPage,
          ),
      },
      {
        path: 'organization/settings',
        canActivate: [requirePermissionGuard('settings.view')],
        loadComponent: () =>
          import('./features/organization/pages/organization-settings/organization-settings.page').then(
            (m) => m.OrganizationSettingsPage,
          ),
      },
      {
        path: 'organization/setup',
        canActivate: [requirePermissionGuard('settings.view'), requireCapabilityGuard('setup')],
        loadComponent: () =>
          import('./features/organization/pages/setup/organization-setup.page').then(
            (m) => m.OrganizationSetupPage,
          ),
      },
      {
        path: 'branches',
        canActivate: [requirePermissionGuard('branches.view'), requireCapabilityGuard('branches')],
        loadComponent: () =>
          import('./features/branches-warehouses/pages/branches/branches.page').then(
            (m) => m.BranchesPage,
          ),
      },
      {
        path: 'branches/new',
        canActivate: [
          requirePermissionGuard('branches.manage'),
          requireCapabilityGuard('branches'),
          requireCapabilityGuard('branches.actions.create', 'action'),
        ],
        loadComponent: () =>
          import('./features/branches-warehouses/pages/branch-form/branch-form.page').then(
            (m) => m.BranchFormPage,
          ),
      },
      {
        path: 'branches/:id',
        canActivate: [
          requirePermissionGuard('branches.manage'),
          requireCapabilityGuard('branches'),
          requireCapabilityGuard('branches.actions.edit', 'action'),
        ],
        loadComponent: () =>
          import('./features/branches-warehouses/pages/branch-form/branch-form.page').then(
            (m) => m.BranchFormPage,
          ),
      },
      {
        path: 'branches/:id/edit',
        canActivate: [
          requirePermissionGuard('branches.manage'),
          requireCapabilityGuard('branches'),
          requireCapabilityGuard('branches.actions.edit', 'action'),
        ],
        loadComponent: () =>
          import('./features/branches-warehouses/pages/branch-form/branch-form.page').then(
            (m) => m.BranchFormPage,
          ),
      },
      {
        path: 'warehouses',
        canActivate: [requirePermissionGuard('warehouses.manage'), requireCapabilityGuard('warehouses')],
        loadComponent: () =>
          import('./features/branches-warehouses/pages/warehouses/warehouses.page').then(
            (m) => m.WarehousesPage,
          ),
      },
      {
        path: 'warehouses/new',
        canActivate: [
          requirePermissionGuard('warehouses.manage'),
          requireCapabilityGuard('warehouses'),
          requireCapabilityGuard('warehouses.actions.create', 'action'),
        ],
        loadComponent: () =>
          import('./features/branches-warehouses/pages/warehouse-form/warehouse-form.page').then(
            (m) => m.WarehouseFormPage,
          ),
      },
      {
        path: 'warehouses/:id',
        canActivate: [
          requirePermissionGuard('warehouses.manage'),
          requireCapabilityGuard('warehouses'),
          requireCapabilityGuard('warehouses.actions.edit', 'action'),
        ],
        loadComponent: () =>
          import('./features/branches-warehouses/pages/warehouse-form/warehouse-form.page').then(
            (m) => m.WarehouseFormPage,
          ),
      },
      {
        path: 'employees',
        canActivate: [requirePermissionGuard('users.view'), requireCapabilityGuard('employees')],
        loadComponent: () =>
          import('./features/users-access/pages/employees/employees.page').then(
            (m) => m.EmployeesPage,
          ),
      },
      {
        path: 'employees/new',
        canActivate: [
          requirePermissionGuard('users.create'),
          requireCapabilityGuard('employees'),
          requireCapabilityGuard('employees.actions.create', 'action'),
        ],
        loadComponent: () =>
          import('./features/users-access/pages/employee-form/employee-form.page').then(
            (m) => m.EmployeeFormPage,
          ),
      },
      {
        path: 'employees/:id',
        canActivate: [requirePermissionGuard('users.view'), requireCapabilityGuard('employees')],
        loadComponent: () =>
          import('./features/users-access/pages/employee-form/employee-form.page').then(
            (m) => m.EmployeeFormPage,
          ),
      },
      {
        path: 'categories',
        canActivate: [
          requirePermissionGuard('catalog.view'),
          requireCapabilityGuard('inventory.categories'),
        ],
        loadComponent: () =>
          import('./features/catalog/pages/categories/categories.page').then(
            (m) => m.CategoriesPage,
          ),
      },
      {
        path: 'categories/new',
        canActivate: [
          requirePermissionGuard('catalog.manage'),
          requireCapabilityGuard('inventory.categories'),
          requireCapabilityGuard('inventory.categories.actions.create', 'action'),
        ],
        loadComponent: () =>
          import('./features/catalog/pages/category-form/category-form.page').then(
            (m) => m.CategoryFormPage,
          ),
      },
      {
        path: 'categories/:id',
        canActivate: [
          requirePermissionGuard('catalog.view'),
          requireCapabilityGuard('inventory.categories'),
          requireCapabilityGuard('inventory.categories.actions.edit', 'action'),
        ],
        loadComponent: () =>
          import('./features/catalog/pages/category-form/category-form.page').then(
            (m) => m.CategoryFormPage,
          ),
      },
      {
        path: 'feature-unavailable',
        loadComponent: () =>
          import('./features/capabilities/pages/feature-unavailable/feature-unavailable.page').then(
            (m) => m.FeatureUnavailablePage,
          ),
      },
      {
        path: 'access-denied',
        loadComponent: () =>
          import('./features/access/pages/access-denied/access-denied.page').then(
            (m) => m.AccessDeniedPage,
          ),
      },
      {
        path: 'platform/organizations/:id/controls',
        canActivate: [
          requirePlatformContextGuard,
          requirePermissionGuard('platform.organizations.view'),
        ],
        loadComponent: () =>
          import('./features/platform/pages/organization-controls/organization-controls.page').then(
            (m) => m.OrganizationControlsPage,
          ),
      },
      {
        path: 'products',
        canActivate: [
          requirePermissionGuard('catalog.view'),
          requireCapabilityGuard('inventory.products'),
        ],
        loadComponent: () =>
          import('./features/catalog/pages/products/products.page').then((m) => m.ProductsPage),
      },
      {
        path: 'products/new',
        canActivate: [
          requirePermissionGuard('catalog.manage'),
          requireCapabilityGuard('inventory.products'),
          requireCapabilityGuard('inventory.products.actions.create', 'action'),
        ],
        loadComponent: () =>
          import('./features/catalog/pages/product-form/product-form.page').then(
            (m) => m.ProductFormPage,
          ),
      },
      {
        path: 'products/:id/pricing',
        canActivate: [
          requirePermissionGuard('pricing.view'),
          requireCapabilityGuard('inventory.products'),
          requireCapabilityGuard('inventory.products.actions.managePricing', 'action'),
        ],
        loadComponent: () =>
          import('./features/catalog/pages/product-pricing/product-pricing.page').then(
            (m) => m.ProductPricingPage,
          ),
      },
      {
        path: 'products/:id',
        canActivate: [
          requirePermissionGuard('catalog.view'),
          requireCapabilityGuard('inventory.products'),
          requireCapabilityGuard('inventory.products.actions.edit', 'action'),
        ],
        loadComponent: () =>
          import('./features/catalog/pages/product-form/product-form.page').then(
            (m) => m.ProductFormPage,
          ),
      },
      {
        path: 'customers',
        canActivate: [requirePermissionGuard('customers.view'), requireCapabilityGuard('customers')],
        loadComponent: () =>
          import('./features/customers/pages/customers/customers.page').then(
            (m) => m.CustomersPage,
          ),
      },
      {
        path: 'customers/new',
        canActivate: [
          requirePermissionGuard('customers.manage'),
          requireCapabilityGuard('customers'),
          requireCapabilityGuard('customers.actions.create', 'action'),
        ],
        loadComponent: () =>
          import('./features/customers/pages/customer-form/customer-form.page').then(
            (m) => m.CustomerFormPage,
          ),
      },
      {
        path: 'customers/:id',
        canActivate: [
          requirePermissionGuard('customers.view'),
          requireCapabilityGuard('customers'),
          requireCapabilityGuard('customers.actions.edit', 'action'),
        ],
        loadComponent: () =>
          import('./features/customers/pages/customer-form/customer-form.page').then(
            (m) => m.CustomerFormPage,
          ),
      },
      {
        path: 'suppliers',
        canActivate: [requirePermissionGuard('suppliers.view'), requireCapabilityGuard('suppliers')],
        loadComponent: () =>
          import('./features/suppliers/pages/suppliers/suppliers.page').then(
            (m) => m.SuppliersPage,
          ),
      },
      {
        path: 'suppliers/new',
        canActivate: [
          requirePermissionGuard('suppliers.manage'),
          requireCapabilityGuard('suppliers'),
          requireCapabilityGuard('suppliers.actions.create', 'action'),
        ],
        loadComponent: () =>
          import('./features/suppliers/pages/supplier-form/supplier-form.page').then(
            (m) => m.SupplierFormPage,
          ),
      },
      {
        path: 'suppliers/:id',
        canActivate: [
          requirePermissionGuard('suppliers.view'),
          requireCapabilityGuard('suppliers'),
          requireCapabilityGuard('suppliers.actions.edit', 'action'),
        ],
        loadComponent: () =>
          import('./features/suppliers/pages/supplier-form/supplier-form.page').then(
            (m) => m.SupplierFormPage,
          ),
      },
      {
        path: 'accounts',
        canActivate: [requirePermissionGuard('accounts.view'), requireCapabilityGuard('accounts')],
        loadComponent: () =>
          import('./features/accounts-expenses/pages/accounts/accounts.page').then(
            (m) => m.AccountsPage,
          ),
      },
      {
        path: 'accounts/new',
        canActivate: [
          requirePermissionGuard('accounts.manage'),
          requireCapabilityGuard('accounts'),
          requireCapabilityGuard('accounts.actions.create', 'action'),
        ],
        loadComponent: () =>
          import('./features/accounts-expenses/pages/account-form/account-form.page').then(
            (m) => m.AccountFormPage,
          ),
      },
      {
        path: 'accounts/:id',
        canActivate: [
          requirePermissionGuard('accounts.view'),
          requireCapabilityGuard('accounts'),
          requireCapabilityGuard('accounts.actions.inspect', 'action'),
        ],
        loadComponent: () =>
          import('./features/accounts-expenses/pages/account-form/account-form.page').then(
            (m) => m.AccountFormPage,
          ),
      },
      {
        path: 'expenses',
        canActivate: [requirePermissionGuard('expenses.view'), requireCapabilityGuard('expenses')],
        loadComponent: () =>
          import('./features/accounts-expenses/pages/expenses/expenses.page').then(
            (m) => m.ExpensesPage,
          ),
      },
      {
        path: 'expenses/new',
        canActivate: [
          requirePermissionGuard('expenses.post'),
          requireCapabilityGuard('expenses'),
          requireCapabilityGuard('expenses.actions.post', 'action'),
        ],
        loadComponent: () =>
          import('./features/accounts-expenses/pages/expense-form/expense-form.page').then(
            (m) => m.ExpenseFormPage,
          ),
      },
      {
        path: 'expenses/:id',
        canActivate: [
          requirePermissionGuard('expenses.view'),
          requireCapabilityGuard('expenses'),
          requireCapabilityGuard('expenses.actions.inspect', 'action'),
        ],
        loadComponent: () =>
          import('./features/accounts-expenses/pages/expense-form/expense-form.page').then(
            (m) => m.ExpenseFormPage,
          ),
      },
      {
        path: 'expense-categories',
        canActivate: [
          requirePermissionGuard('expenses.view'),
          requireCapabilityGuard('expenses'),
          requireCapabilityGuard('expenses.categories'),
        ],
        loadComponent: () =>
          import('./features/accounts-expenses/pages/expense-categories/expense-categories.page').then(
            (m) => m.ExpenseCategoriesPage,
          ),
      },
      {
        path: 'expense-categories/new',
        canActivate: [
          requirePermissionGuard('expenses.view'),
          requireCapabilityGuard('expenses'),
          requireCapabilityGuard('expenses.categories'),
          requireCapabilityGuard('expenses.categories.actions.create', 'action'),
        ],
        loadComponent: () =>
          import('./features/accounts-expenses/pages/expense-category-form/expense-category-form.page').then(
            (m) => m.ExpenseCategoryFormPage,
          ),
      },
      {
        path: 'expense-categories/:id',
        canActivate: [
          requirePermissionGuard('expenses.view'),
          requireCapabilityGuard('expenses'),
          requireCapabilityGuard('expenses.categories'),
          requireCapabilityGuard('expenses.categories.actions.edit', 'action'),
        ],
        loadComponent: () =>
          import('./features/accounts-expenses/pages/expense-category-form/expense-category-form.page').then(
            (m) => m.ExpenseCategoryFormPage,
          ),
      },
      {
        path: 'purchases',
        canActivate: [requirePermissionGuard('purchases.view'), requireCapabilityGuard('purchases')],
        loadComponent: () =>
          import('./features/purchases/pages/purchases/purchases.page').then(
            (m) => m.PurchasesPage,
          ),
      },
      {
        path: 'purchases/new',
        canActivate: [
          requirePermissionGuard('purchases.create'),
          requireCapabilityGuard('purchases'),
          requireCapabilityGuard('purchases.actions.createDraft', 'action'),
        ],
        loadComponent: () =>
          import('./features/purchases/pages/purchase-edit/purchase-edit.page').then(
            (m) => m.PurchaseEditPage,
          ),
      },
      {
        path: 'purchases/:id',
        canActivate: [
          requirePermissionGuard('purchases.view'),
          requireCapabilityGuard('purchases'),
          requireCapabilityGuard('purchases.actions.inspect', 'action'),
        ],
        loadComponent: () =>
          import('./features/purchases/pages/purchase-edit/purchase-edit.page').then(
            (m) => m.PurchaseEditPage,
          ),
      },
      {
        path: 'supplier-payments',
        canActivate: [
          requirePermissionGuard('supplier-payments.view'),
          requireCapabilityGuard('payments.supplier'),
        ],
        loadComponent: () =>
          import('./features/supplier-payments/pages/supplier-payments/supplier-payments.page').then(
            (m) => m.SupplierPaymentsPage,
          ),
      },
      {
        path: 'supplier-payments/new',
        canActivate: [
          requirePermissionGuard('supplier-payments.post'),
          requireCapabilityGuard('payments.supplier'),
          requireCapabilityGuard('payments.supplier.actions.post', 'action'),
        ],
        loadComponent: () =>
          import('./features/supplier-payments/pages/supplier-payment-form/supplier-payment-form.page').then(
            (m) => m.SupplierPaymentFormPage,
          ),
      },
      {
        path: 'sales',
        canActivate: [requirePermissionGuard('sales.view'), requireCapabilityGuard('sales')],
        loadComponent: () =>
          import('./features/sales/pages/sales/sales.page').then((m) => m.SalesPage),
      },
      {
        path: 'sales/new',
        canActivate: [
          requirePermissionGuard('sales.create'),
          requireCapabilityGuard('sales'),
          requireCapabilityGuard('sales.actions.createDraft', 'action'),
        ],
        loadComponent: () =>
          import('./features/sales/pages/sale-edit/sale-edit.page').then((m) => m.SaleEditPage),
      },
      {
        path: 'sales/:id/print',
        canActivate: [
          requirePermissionGuard('sales.view'),
          requireCapabilityGuard('sales'),
          requireCapabilityGuard('sales.actions.print', 'action'),
        ],
        loadComponent: () =>
          import('./features/sales/pages/sale-print/sale-print.page').then((m) => m.SalePrintPage),
      },
      {
        path: 'sales/:id',
        canActivate: [
          requirePermissionGuard('sales.view'),
          requireCapabilityGuard('sales'),
          requireCapabilityGuard('sales.actions.inspect', 'action'),
        ],
        loadComponent: () =>
          import('./features/sales/pages/sale-edit/sale-edit.page').then((m) => m.SaleEditPage),
      },
      {
        path: 'returns/without-invoice',
        canActivate: [
          requirePermissionGuard('returns.view'),
          requireCapabilityGuard('returns'),
          requireCapabilityGuard('returns.actions.withoutInvoice', 'action'),
        ],
        loadComponent: () =>
          import('./features/returns/pages/return-without-invoice/return-without-invoice.page').then(
            (m) => m.ReturnWithoutInvoicePage,
          ),
      },
      {
        path: 'returns/:id',
        canActivate: [
          requirePermissionGuard('returns.view'),
          requireCapabilityGuard('returns'),
          requireCapabilityGuard('returns.actions.inspect', 'action'),
        ],
        loadComponent: () =>
          import('./features/returns/pages/return-detail/return-detail.page').then(
            (m) => m.ReturnDetailPage,
          ),
      },
      {
        path: 'returns',
        canActivate: [requirePermissionGuard('returns.view'), requireCapabilityGuard('returns')],
        loadComponent: () =>
          import('./features/returns/pages/returns-list/returns-list.page').then(
            (m) => m.ReturnsListPage,
          ),
      },
      {
        path: 'customer-payments',
        canActivate: [
          requirePermissionGuard('customer-payments.view'),
          requireCapabilityGuard('payments.customer'),
        ],
        loadComponent: () =>
          import('./features/customer-payments/pages/customer-payments/customer-payments.page').then(
            (m) => m.CustomerPaymentsPage,
          ),
      },
      {
        path: 'customer-payments/new',
        canActivate: [
          requirePermissionGuard('customer-payments.post'),
          requireCapabilityGuard('payments.customer'),
          requireCapabilityGuard('payments.customer.actions.post', 'action'),
        ],
        loadComponent: () =>
          import('./features/customer-payments/pages/customer-payment-form/customer-payment-form.page').then(
            (m) => m.CustomerPaymentFormPage,
          ),
      },
      {
        path: 'supplier-payments/ledger',
        canActivate: [
          requirePermissionGuard('supplier-payments.view'),
          requireCapabilityGuard('payments.supplierLedger'),
        ],
        loadComponent: () =>
          import('./features/supplier-payments/pages/supplier-ledger/supplier-ledger.page').then(
            (m) => m.SupplierLedgerPage,
          ),
      },
      {
        path: 'inventory/stock',
        canActivate: [requirePermissionGuard('inventory.view'), requireCapabilityGuard('inventory.stock')],
        loadComponent: () =>
          import('./features/inventory/pages/stock/stock-inquiry.page').then(
            (m) => m.StockInquiryPage,
          ),
      },
      {
        path: 'inventory/opening-stock',
        canActivate: [
          requirePermissionGuard('inventory.opening-stock.post'),
          requireCapabilityGuard('inventory.openingStock'),
        ],
        loadComponent: () =>
          import('./features/inventory/pages/opening-stock/opening-stock.page').then(
            (m) => m.OpeningStockPage,
          ),
      },
      {
        path: 'inventory/movements',
        canActivate: [
          requirePermissionGuard('inventory.view'),
          requireCapabilityGuard('inventory.movements'),
        ],
        loadComponent: () =>
          import('./features/inventory/pages/movements/movements.page').then(
            (m) => m.MovementsPage,
          ),
      },
      {
        path: 'inventory/batches',
        canActivate: [
          requirePermissionGuard('inventory.view'),
          requireCapabilityGuard('inventory.batches'),
        ],
        loadComponent: () =>
          import('./features/inventory/pages/batches/batches.page').then((m) => m.BatchesPage),
      },
      {
        path: 'inventory/expiry',
        canActivate: [
          requirePermissionGuard('inventory.expiry.view'),
          requireCapabilityGuard('inventory.expiry'),
        ],
        loadComponent: () =>
          import('./features/inventory/pages/expiry/expiry-inquiry.page').then(
            (m) => m.ExpiryInquiryPage,
          ),
      },
      {
        path: 'inventory/adjustments',
        canActivate: [
          requirePermissionGuard('inventory.adjust'),
          requireCapabilityGuard('inventory.adjustments'),
        ],
        loadComponent: () =>
          import('./features/inventory/pages/adjustments/adjustments.page').then(
            (m) => m.AdjustmentsPage,
          ),
      },
      {
        path: 'inventory/transfers',
        canActivate: [
          requirePermissionGuard('inventory.transfer'),
          requireCapabilityGuard('inventory.transfers'),
        ],
        loadComponent: () =>
          import('./features/inventory/pages/transfers/transfers.page').then(
            (m) => m.TransfersPage,
          ),
      },
      {
        path: 'inventory/reconciliation',
        canActivate: [
          requirePermissionGuard('inventory.adjust'),
          requireCapabilityGuard('inventory.reconciliation'),
        ],
        loadComponent: () =>
          import('./features/inventory/pages/reconciliation/reconciliation.page').then(
            (m) => m.ReconciliationPage,
          ),
      },
    ],
  },
  {
    path: 'subscription/billing',
    redirectTo: 'app/subscription/billing',
    pathMatch: 'full',
  },
  {
    path: 'platform/organizations',
    redirectTo: 'app/platform/organizations',
    pathMatch: 'full',
  },
  {
    path: 'platform/plans',
    redirectTo: 'app/platform/plans',
    pathMatch: 'full',
  },
  {
    path: 'platform/billing-review',
    redirectTo: 'app/platform/billing-review',
    pathMatch: 'full',
  },
  {
    path: 'platform/operations',
    redirectTo: 'app/platform/operations',
    pathMatch: 'full',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/public/pages/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
