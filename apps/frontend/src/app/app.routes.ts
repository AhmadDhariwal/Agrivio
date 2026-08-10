import { Route } from '@angular/router';
import {
  requirePlatformContextGuard,
  requireSessionGuard,
} from './core/guards/session.guards';

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
      import('./features/auth/pages/context-switcher/context-switcher.page').then((m) => m.ContextSwitcherPage),
  },
  {
    path: 'password-reset',
    loadComponent: () =>
      import('./features/auth/pages/password-reset-request/password-reset-request.page').then((m) => m.PasswordResetRequestPage),
  },
  {
    path: 'password-reset/confirm',
    loadComponent: () =>
      import('./features/auth/pages/password-reset-confirm/password-reset-confirm.page').then((m) => m.PasswordResetConfirmPage),
  },
  {
    path: 'request-access',
    loadComponent: () =>
      import('./features/onboarding/pages/request-access/request-access.page').then((m) => m.RequestAccessPage),
  },
  {
    path: 'activate',
    loadComponent: () => import('./features/onboarding/pages/activate/activate.page').then((m) => m.ActivatePage),
  },
  {
    path: 'app',
    canActivate: [requireSessionGuard],
    loadComponent: () =>
      import('./features/shell/pages/app-shell/app-shell.page').then((m) => m.AppShellPage),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/shell/pages/workspace-home/workspace-home.page').then((m) => m.WorkspaceHomePage),
      },
      {
        path: 'subscription/billing',
        loadComponent: () =>
          import('./features/subscriptions/pages/billing-evidence/billing-evidence.page').then(
            (m) => m.BillingEvidencePage,
          ),
      },
      {
        path: 'platform/organizations',
        canActivate: [requirePlatformContextGuard],
        loadComponent: () =>
          import('./features/platform/pages/organizations-admin/organizations-admin.page').then(
            (m) => m.PlatformOrganizationsPage,
          ),
      },
      {
        path: 'platform/plans',
        canActivate: [requirePlatformContextGuard],
        loadComponent: () =>
          import('./features/platform/pages/plans-admin/plans-admin.page').then((m) => m.PlatformPlansPage),
      },
      {
        path: 'platform/billing-review',
        canActivate: [requirePlatformContextGuard],
        loadComponent: () =>
          import('./features/platform/pages/billing-review/billing-review.page').then(
            (m) => m.PlatformBillingReviewPage,
          ),
      },
      {
        path: 'organization/settings',
        loadComponent: () =>
          import('./features/organization/pages/organization-settings/organization-settings.page').then(
            (m) => m.OrganizationSettingsPage,
          ),
      },
      {
        path: 'branches',
        loadComponent: () =>
          import('./features/branches-warehouses/pages/branches/branches.page').then(
            (m) => m.BranchesPage,
          ),
      },
      {
        path: 'branches/new',
        loadComponent: () =>
          import('./features/branches-warehouses/pages/branch-form/branch-form.page').then(
            (m) => m.BranchFormPage,
          ),
      },
      {
        path: 'branches/:id',
        loadComponent: () =>
          import('./features/branches-warehouses/pages/branch-form/branch-form.page').then(
            (m) => m.BranchFormPage,
          ),
      },
      {
        path: 'warehouses',
        loadComponent: () =>
          import('./features/branches-warehouses/pages/warehouses/warehouses.page').then(
            (m) => m.WarehousesPage,
          ),
      },
      {
        path: 'warehouses/new',
        loadComponent: () =>
          import('./features/branches-warehouses/pages/warehouse-form/warehouse-form.page').then(
            (m) => m.WarehouseFormPage,
          ),
      },
      {
        path: 'warehouses/:id',
        loadComponent: () =>
          import('./features/branches-warehouses/pages/warehouse-form/warehouse-form.page').then(
            (m) => m.WarehouseFormPage,
          ),
      },
      {
        path: 'employees',
        loadComponent: () =>
          import('./features/users-access/pages/employees/employees.page').then((m) => m.EmployeesPage),
      },
      {
        path: 'employees/new',
        loadComponent: () =>
          import('./features/users-access/pages/employee-form/employee-form.page').then(
            (m) => m.EmployeeFormPage,
          ),
      },
      {
        path: 'employees/:id',
        loadComponent: () =>
          import('./features/users-access/pages/employee-form/employee-form.page').then(
            (m) => m.EmployeeFormPage,
          ),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/catalog/pages/categories/categories.page').then((m) => m.CategoriesPage),
      },
      {
        path: 'categories/new',
        loadComponent: () =>
          import('./features/catalog/pages/category-form/category-form.page').then(
            (m) => m.CategoryFormPage,
          ),
      },
      {
        path: 'categories/:id',
        loadComponent: () =>
          import('./features/catalog/pages/category-form/category-form.page').then(
            (m) => m.CategoryFormPage,
          ),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./features/catalog/pages/products/products.page').then((m) => m.ProductsPage),
      },
      {
        path: 'products/new',
        loadComponent: () =>
          import('./features/catalog/pages/product-form/product-form.page').then(
            (m) => m.ProductFormPage,
          ),
      },
      {
        path: 'products/:id/pricing',
        loadComponent: () =>
          import('./features/catalog/pages/product-pricing/product-pricing.page').then(
            (m) => m.ProductPricingPage,
          ),
      },
      {
        path: 'products/:id',
        loadComponent: () =>
          import('./features/catalog/pages/product-form/product-form.page').then(
            (m) => m.ProductFormPage,
          ),
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./features/customers/pages/customers/customers.page').then((m) => m.CustomersPage),
      },
      {
        path: 'customers/new',
        loadComponent: () =>
          import('./features/customers/pages/customer-form/customer-form.page').then(
            (m) => m.CustomerFormPage,
          ),
      },
      {
        path: 'customers/:id',
        loadComponent: () =>
          import('./features/customers/pages/customer-form/customer-form.page').then(
            (m) => m.CustomerFormPage,
          ),
      },
      {
        path: 'suppliers',
        loadComponent: () =>
          import('./features/suppliers/pages/suppliers/suppliers.page').then((m) => m.SuppliersPage),
      },
      {
        path: 'suppliers/new',
        loadComponent: () =>
          import('./features/suppliers/pages/supplier-form/supplier-form.page').then(
            (m) => m.SupplierFormPage,
          ),
      },
      {
        path: 'suppliers/:id',
        loadComponent: () =>
          import('./features/suppliers/pages/supplier-form/supplier-form.page').then(
            (m) => m.SupplierFormPage,
          ),
      },
      {
        path: 'accounts',
        loadComponent: () =>
          import('./features/accounts-expenses/pages/accounts/accounts.page').then(
            (m) => m.AccountsPage,
          ),
      },
      {
        path: 'accounts/new',
        loadComponent: () =>
          import('./features/accounts-expenses/pages/account-form/account-form.page').then(
            (m) => m.AccountFormPage,
          ),
      },
      {
        path: 'accounts/:id',
        loadComponent: () =>
          import('./features/accounts-expenses/pages/account-form/account-form.page').then(
            (m) => m.AccountFormPage,
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
    path: '**',
    loadComponent: () =>
      import('./features/public/pages/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
