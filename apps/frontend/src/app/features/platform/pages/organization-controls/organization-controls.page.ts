import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CapabilitiesApi } from '../../../capabilities/data-access/capabilities.api';
import {
  CapabilityControlType,
  CapabilityPolicyChange,
  PlatformCapabilityControl,
  PlatformOrganizationCapabilitySnapshot,
} from '../../../capabilities/models/capability.models';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';

type DraftValues = Readonly<Record<string, Readonly<Record<string, boolean>>>>;
type ConfigurableModule =
  | 'inventory.products'
  | 'inventory.categories'
  | 'inventory.stock'
  | 'inventory.openingStock'
  | 'inventory.batches'
  | 'inventory.expiry'
  | 'inventory.adjustments'
  | 'inventory.transfers'
  | 'inventory.reconciliation'
  | 'inventory.movements'
  | 'branches'
  | 'warehouses'
  | 'customers'
  | 'suppliers'
  | 'returns'
  | 'expenses'
  | 'expenses.categories'
  | 'accounts'
  | 'employees'
  | 'reports'
  | 'alerts'
  | 'purchases'
  | 'payments.customer'
  | 'payments.supplier'
  | 'payments.supplierLedger'
  | 'sales'
  | 'dashboard'
  | 'setup'
  | 'billing'
  | 'settings';

export interface ModuleNavItem {
  readonly key: ConfigurableModule;
  readonly label: string;
  readonly testId?: string;
}

export interface ModuleNavGroup {
  readonly label: string;
  readonly modules: readonly ModuleNavItem[];
}

export const MODULE_NAV_GROUPS: readonly ModuleNavGroup[] = [
  {
    label: 'Dashboard',
    modules: [
      { key: 'dashboard', label: 'Dashboard', testId: 'dashboard-control-module' },
    ],
  },
  {
    label: 'Sales',
    modules: [
      { key: 'sales', label: 'Sales', testId: 'sales-control-module' },
      { key: 'payments.customer', label: 'Customer Payments', testId: 'customer-payments-control-module' },
    ],
  },
  {
    label: 'Purchases',
    modules: [
      { key: 'purchases', label: 'Purchases', testId: 'purchases-control-module' },
      { key: 'payments.supplier', label: 'Supplier Payments', testId: 'supplier-payments-control-module' },
      { key: 'payments.supplierLedger', label: 'Supplier Ledger', testId: 'supplier-ledger-control-module' },
    ],
  },
  {
    label: 'Inventory',
    modules: [
      { key: 'inventory.products', label: 'Products', testId: 'products-control-module' },
      { key: 'inventory.categories', label: 'Categories', testId: 'categories-control-module' },
      { key: 'inventory.stock', label: 'Inventory / Stock on Hand', testId: 'inventory-control-module' },
      { key: 'inventory.openingStock', label: 'Opening Stock', testId: 'opening-stock-control-module' },
      { key: 'inventory.batches', label: 'Product Batches', testId: 'batches-control-module' },
      { key: 'inventory.expiry', label: 'Expiry Inquiry', testId: 'expiry-control-module' },
      { key: 'inventory.adjustments', label: 'Stock Adjustments', testId: 'adjustments-control-module' },
      { key: 'inventory.transfers', label: 'Warehouse Transfers', testId: 'transfers-control-module' },
      { key: 'inventory.reconciliation', label: 'Inventory Reconciliation', testId: 'reconciliation-control-module' },
      { key: 'inventory.movements', label: 'Stock Movements', testId: 'movements-control-module' },
    ],
  },
  {
    label: 'Customers & Suppliers',
    modules: [
      { key: 'customers', label: 'Customers', testId: 'customers-control-module' },
      { key: 'suppliers', label: 'Suppliers', testId: 'suppliers-control-module' },
    ],
  },
  {
    label: 'Returns & Corrections',
    modules: [
      { key: 'returns', label: 'Returns and Corrections', testId: 'returns-control-module' },
    ],
  },
  {
    label: 'Finance',
    modules: [
      { key: 'expenses', label: 'Expenses', testId: 'expenses-control-module' },
      { key: 'expenses.categories', label: 'Expense Categories', testId: 'expense-categories-control-module' },
      { key: 'accounts', label: 'Accounts', testId: 'accounts-control-module' },
    ],
  },
  {
    label: 'Reports & Insights',
    modules: [
      { key: 'reports', label: 'Reports', testId: 'reports-control-module' },
      { key: 'alerts', label: 'Alerts', testId: 'alerts-control-module' },
    ],
  },
  {
    label: 'Organization',
    modules: [
      { key: 'branches', label: 'Branches', testId: 'branches-control-module' },
      { key: 'warehouses', label: 'Warehouses', testId: 'warehouses-control-module' },
      { key: 'employees', label: 'Employees & Access', testId: 'employees-control-module' },
      { key: 'setup', label: 'Organization Setup', testId: 'setup-control-module' },
      { key: 'billing', label: 'Billing', testId: 'billing-control-module' },
      { key: 'settings', label: 'Organization Settings', testId: 'settings-control-module' },
    ],
  },
];

type PendingConfirmation =
  | { readonly kind: 'save' }
  | { readonly kind: 'reset-control'; readonly control: PlatformCapabilityControl }
  | { readonly kind: 'reset-module'; readonly moduleKey: ConfigurableModule }
  | { readonly kind: 'reset-organization' };

@Component({
  selector: 'agrivio-organization-controls-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiAlertComponent,
    UiConfirmDialogComponent,
    UiLoadingStateComponent,
    UiPageHeaderComponent,
  ],
  templateUrl: './organization-controls.page.html',
  styleUrl: './organization-controls.page.scss',
})
export class OrganizationControlsPage {
  private readonly api = inject(CapabilitiesApi);
  private readonly route = inject(ActivatedRoute);
  readonly organizationId = String(this.route.snapshot.paramMap.get('id') ?? '');

  readonly snapshot = signal<PlatformOrganizationCapabilitySnapshot | null>(null);
  readonly draftValues = signal<DraftValues>({});
  readonly selectedModule = signal<ConfigurableModule>('inventory.products');
  readonly moduleGroups = MODULE_NAV_GROUPS;
  readonly search = signal('');
  readonly reason = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly pendingConfirmation = signal<PendingConfirmation | null>(null);

  readonly controls = computed(() => this.snapshot()?.policy.controls ?? []);
  readonly selectedControls = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.controls().filter(
      (control) =>
        control.moduleKey === this.selectedModule() &&
        control.key !== 'inventory' &&
        (!query ||
          control.label.toLowerCase().includes(query) ||
          control.key.toLowerCase().includes(query)),
    );
  });
  readonly moduleControls = computed(() =>
    this.selectedControls().filter(
      (control) =>
        (control.type === 'FEATURE' || control.type === 'MODULE') &&
        control.key === control.moduleKey,
    ),
  );
  readonly viewControls = computed(() => this.byType('VIEW'));
  readonly fieldControls = computed(() =>
    this.byType('FIELD').filter((control) => !this.isRequiredWorkflowControl(control)),
  );
  readonly requiredWorkflowControls = computed(() =>
    this.byType('FIELD').filter((control) => this.isRequiredWorkflowControl(control)),
  );
  readonly featureControls = computed(() =>
    this.byType('FEATURE', false).filter((control) => !this.isBatchGroupedFeature(control)),
  );
  readonly moduleInfoControls = computed(() => {
    if (this.selectedModule() === 'setup') return this.setupFeatures('moduleInfo');
    if (this.selectedModule() === 'branches') {
      return this.branchesFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'warehouses') {
      return this.warehousesFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'suppliers') {
      return this.suppliersFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'customers') {
      return this.customersFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'returns') {
      return this.returnsFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'expenses') {
      return this.expensesFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'expenses.categories') {
      return this.expenseCategoriesFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'accounts') {
      return this.accountsFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'employees') {
      return this.employeesFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'reports') {
      return this.reportsFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'alerts') {
      return this.alertsFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'purchases') {
      return this.purchasesFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'payments.customer') {
      return this.customerPaymentsFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'payments.supplier') {
      return this.supplierPaymentsFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'payments.supplierLedger') {
      return this.supplierLedgerFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'inventory.movements') {
      return this.movementsFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'inventory.reconciliation') {
      return this.reconciliationFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'inventory.transfers') {
      return this.transfersFeatures('moduleInfo');
    }
    if (this.selectedModule() === 'inventory.adjustments') {
      return this.adjustmentsFeatures('moduleInfo');
    }
    return this.batchFeatures('moduleInfo');
  });
  readonly presentationFeatureControls = computed(() => {
    if (this.selectedModule() === 'setup') {
      return this.setupFeatures(
        'summary',
        'subscriptionNotice',
        'taskList',
        'operationalReadiness',
        'notes',
      );
    }
    if (this.selectedModule() === 'inventory.movements') {
      return this.movementsFeatures(
        'search',
        'filters',
        'kpiCards',
        'referenceResolution',
        'inspector',
        'technicalDetails',
        'mobileCards',
      );
    }
    if (this.selectedModule() === 'alerts') {
      return this.alertsFeatures('summaryCards', 'navbarNotifications');
    }
    return [];
  });
  readonly formExperienceControls = computed(() => {
    if (this.selectedModule() === 'payments.customer') {
      return this.customerPaymentsFeatures('customerSearch', 'ledgerPreview');
    }
    if (this.selectedModule() === 'inventory.transfers') {
      return this.transfersFeatures(
        'productSearch',
        'productContext',
        'stockContext',
        'guidance',
        'serverTransferDate',
      );
    }
    if (this.selectedModule() === 'inventory.adjustments') {
      return this.adjustmentsFeatures(
        'productSearch',
        'productContext',
        'stockContext',
        'guidance',
        'serverPostingDate',
      );
    }
    if (this.selectedModule() === 'sales') {
      return this.salesFeatures('customerSearch', 'productSearch');
    }
    return [];
  });
  readonly historyControls = computed(() => {
    if (this.selectedModule() === 'accounts') {
      return this.accountsFeatures('movementHistory');
    }
    if (this.selectedModule() === 'inventory.transfers') {
      return this.transfersFeatures('recentTransfers');
    }
    if (this.selectedModule() === 'inventory.adjustments') {
      return this.adjustmentsFeatures('recentAdjustments');
    }
    return [];
  });
  readonly filterControls = computed(() => {
    if (this.selectedModule() === 'setup') return this.setupFeatures('search', 'statusFilter');
    if (this.selectedModule() === 'dashboard') {
      return this.dashboardFeatures('datePeriodFilter', 'branchFilter', 'warehouseFilter');
    }
    if (this.selectedModule() === 'payments.customer') {
      return this.customerPaymentsFeatures('search', 'paymentDateFilter');
    }
    if (this.selectedModule() === 'sales') {
      return this.salesFeatures('search', 'statusFilter');
    }
    if (this.selectedModule() === 'accounts') {
      return this.accountsFeatures('search', 'statusFilter');
    }
    if (this.selectedModule() === 'employees') {
      return this.employeesFeatures('search', 'statusFilter', 'roleFilter');
    }
    if (this.selectedModule() === 'purchases') {
      return this.purchasesFeatures('search', 'statusFilter');
    }
    if (this.selectedModule() === 'payments.supplier') {
      return this.supplierPaymentsFeatures('paymentDateFilter');
    }
    if (this.selectedModule() === 'payments.supplierLedger') {
      return this.supplierLedgerFeatures('ledgerFilters', 'supplierSearch');
    }
    if (this.selectedModule() === 'branches') {
      return this.branchesFeatures('search', 'statusFilter');
    }
    if (this.selectedModule() === 'warehouses') {
      return this.warehousesFeatures('search', 'statusFilter');
    }
    if (this.selectedModule() === 'suppliers') {
      return this.suppliersFeatures('search', 'statusFilter');
    }
    if (this.selectedModule() === 'customers') {
      return this.customersFeatures('search', 'statusFilter');
    }
    if (this.selectedModule() === 'returns') {
      return this.returnsFeatures('typeFilter', 'statusFilter', 'warehouseFilter');
    }
    if (this.selectedModule() === 'expenses') {
      return this.expensesFeatures('statusFilter', 'dateSearch');
    }
    if (this.selectedModule() === 'expenses.categories') {
      return this.expenseCategoriesFeatures('search', 'statusFilter');
    }
    if (this.selectedModule() === 'inventory.reconciliation') {
      return this.reconciliationFeatures('search', 'warehouseFilter', 'findingFilter');
    }
    if (this.selectedModule() === 'inventory.expiry') {
      return this.batchFeatures('search', 'productFilter', 'warehouseFilter', 'classificationFilter');
    }
    if (this.selectedModule() === 'inventory.batches') {
      return this.batchFeatures('search', 'productFilter', 'warehouseFilter');
    }
    return [];
  });
  readonly kpiControls = computed(() => {
    if (this.selectedModule() === 'accounts') {
      return this.accountsFeatures('kpiCards');
    }
    if (this.selectedModule() === 'employees') {
      return this.employeesFeatures('kpiCards');
    }
    if (this.selectedModule() === 'suppliers') {
      return this.suppliersFeatures('kpiCards');
    }
    if (this.selectedModule() === 'customers') {
      return this.customersFeatures('kpiCards');
    }
    if (this.selectedModule() === 'inventory.reconciliation') {
      return this.reconciliationFeatures('kpiCards');
    }
    if (this.selectedModule() === 'payments.supplierLedger') {
      return this.supplierLedgerFeatures('reconciliationSummary');
    }
    return [];
  });
  readonly inspectorControls = computed(() => {
    if (this.selectedModule() === 'suppliers') {
      return this.suppliersFeatures('inspector', 'technicalDetails');
    }
    if (this.selectedModule() === 'customers') {
      return this.customersFeatures('inspector', 'technicalDetails');
    }
    if (this.selectedModule() === 'inventory.reconciliation') {
      return this.reconciliationFeatures('inspector', 'technicalDetails');
    }
    if (this.selectedModule() === 'inventory.expiry') {
      return this.batchFeatures('timelineSection', 'quantitySection', 'technicalDetails');
    }
    if (this.selectedModule() === 'inventory.batches') {
      return this.batchFeatures('stockByLocation', 'technicalDetails');
    }
    return [];
  });
  readonly widgetControls = computed(() => this.byType('WIDGET'));
  readonly reportAvailabilityControls = computed(() =>
    this.selectedModule() === 'reports'
      ? this.byType('FEATURE', false).filter((control) =>
          control.key.startsWith('reports.reportAvailability.'),
        )
      : [],
  );
  readonly alertTypeAvailabilityControls = computed(() =>
    this.selectedModule() === 'alerts'
      ? this.byType('FEATURE', false).filter((control) =>
          control.key.startsWith('alerts.alertTypeAvailability.'),
        )
      : [],
  );
  readonly actionControls = computed(() => this.byType('ACTION'));

  readonly changes = computed<readonly CapabilityPolicyChange[]>(() => {
    const draft = this.draftValues();
    const changes: CapabilityPolicyChange[] = [];
    for (const control of this.controls()) {
      const next = draft[control.key];
      if (next === undefined) continue;
      const changedValue: Record<string, boolean> = {};
      for (const [mode, value] of Object.entries(next)) {
        if (value !== control.configuredValue[mode]) changedValue[mode] = value;
      }
      if (Object.keys(changedValue).length > 0) {
        changes.push({ key: control.key, value: changedValue });
      }
    }
    return changes;
  });

  readonly changeSummary = computed(() =>
    this.changes().flatMap((change) => {
      const control = this.controls().find((item) => item.key === change.key);
      return Object.entries(change.value ?? {}).map(([mode, value]) => ({
        key: `${change.key}.${mode}`,
        label: control?.label ?? change.key,
        before: this.stateLabel(mode, control?.configuredValue[mode] === true),
        after: this.stateLabel(mode, value),
        risk: control?.risk ?? 'NORMAL',
      }));
    }),
  );
  readonly selectedOverrideCount = computed(
    () =>
      this.controls().filter(
        (control) => control.moduleKey === this.selectedModule() && control.override !== null,
      ).length,
  );
  readonly organizationOverrideCount = computed(
    () => this.controls().filter((control) => control.override !== null).length,
  );
  readonly confirmOpen = computed(() => this.pendingConfirmation() !== null);
  readonly disablingOpeningStock = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.openingStock' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingBatches = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.batches' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingExpiry = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.expiry' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingAdjustments = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.adjustments' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingTransfers = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.transfers' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingReconciliation = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.reconciliation' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingMovements = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'inventory.movements' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingBranches = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'branches' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingCustomers = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'customers' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingSuppliers = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'suppliers' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingReturns = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'returns' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingWarehouses = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'warehouses' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingExpenses = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'expenses' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingExpenseCategories = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'expenses.categories' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingAccounts = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'accounts' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingEmployees = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'employees' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingReports = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'reports' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingAlerts = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'alerts' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingPurchases = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'purchases' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingCustomerPayments = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'payments.customer' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingSupplierPayments = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'payments.supplier' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingSupplierLedger = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'payments.supplierLedger' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingSales = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'sales' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingDashboard = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'dashboard' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingBilling = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'billing' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingSetup = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'setup' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly disablingSettings = computed(() => {
    const changes = this.changes();
    return (
      changes.length === 1 &&
      changes[0]?.key === 'settings' &&
      changes[0].value?.['enabled'] === false
    );
  });
  readonly confirmationTitle = computed(() => {
    const pending = this.pendingConfirmation();
    const organization = this.snapshot()?.organization.name ?? 'this organization';
    if (pending?.kind === 'reset-control') return `Reset “${pending.control.label}”?`;
    if (pending?.kind === 'reset-module') {
      return `Reset ${this.moduleLabel(pending.moduleKey)} controls for ${organization}?`;
    }
    if (pending?.kind === 'reset-organization') return `Reset all controls for ${organization}?`;
    if (this.disablingSetup()) return `Disable Organization Setup for ${organization}?`;
    if (this.disablingSettings()) return `Disable Organization Settings for ${organization}?`;
    if (this.disablingBilling()) return `Disable Billing for ${organization}?`;
    if (this.disablingOpeningStock()) return `Disable Opening Stock for ${organization}?`;
    if (this.disablingBatches()) return `Disable Product Batches for ${organization}?`;
    if (this.disablingExpiry()) return `Disable Expiry Inquiry for ${organization}?`;
    if (this.disablingAdjustments()) return `Disable Stock Adjustments for ${organization}?`;
    if (this.disablingTransfers()) return `Disable Warehouse Transfers for ${organization}?`;
    if (this.disablingReconciliation()) {
      return `Disable Inventory Reconciliation for ${organization}?`;
    }
    if (this.disablingMovements()) {
      return `Disable Stock Movements for ${organization}?`;
    }
    if (this.disablingWarehouses()) {
      return `Disable Warehouses for ${organization}?`;
    }
    if (this.disablingCustomers()) {
      return `Disable Customers for ${organization}?`;
    }
    if (this.disablingSuppliers()) {
      return `Disable Suppliers for ${organization}?`;
    }
    if (this.disablingReturns()) {
      return `Disable Returns and Corrections for ${organization}?`;
    }
    if (this.disablingExpenses()) {
      return `Disable Expenses for ${organization}?`;
    }
    if (this.disablingExpenseCategories()) {
      return `Disable Expense Categories for ${organization}?`;
    }
    if (this.disablingAccounts()) {
      return `Disable Accounts for ${organization}?`;
    }
    if (this.disablingEmployees()) {
      return `Disable Employees & Access for ${organization}?`;
    }
    if (this.disablingReports()) {
      return `Disable Reports for ${organization}?`;
    }
    if (this.disablingAlerts()) {
      return `Disable Alerts for ${organization}?`;
    }
    if (this.disablingPurchases()) {
      return `Disable Purchases for ${organization}?`;
    }
    if (this.disablingCustomerPayments()) {
      return `Disable Customer Payments for ${organization}?`;
    }
    if (this.disablingSupplierPayments()) {
      return `Disable Supplier Payments for ${organization}?`;
    }
    if (this.disablingSupplierLedger()) {
      return `Disable Supplier Ledger for ${organization}?`;
    }
    if (this.disablingSales()) {
      return `Disable Sales for ${organization}?`;
    }
    if (this.disablingDashboard()) {
      return `Disable Dashboard for ${organization}?`;
    }
    const single = this.changeSummary().length === 1 ? this.changeSummary()[0] : null;
    if (single?.risk === 'CRITICAL' && single.after === 'Disabled') {
      return `Disable ${single.label} for ${organization}?`;
    }
    return `Apply ${this.changeSummary().length} changes to ${organization}?`;
  });
  readonly confirmationMessage = computed(() => {
    const pending = this.pendingConfirmation();
    const organization = this.snapshot()?.organization.name ?? 'this organization';
    if (pending?.kind === 'reset-control') {
      return `The organization-specific override will be removed and Agrivio's default behavior will apply. This affects ${organization} only.`;
    }
    if (pending?.kind === 'reset-module') {
      return `${this.selectedOverrideCount()} organization-specific override(s) in ${this.moduleLabel(pending.moduleKey)} will be removed. Existing organization data is unchanged.`;
    }
    if (pending?.kind === 'reset-organization') {
      return `${this.organizationOverrideCount()} organization-specific override(s) will be removed. Agrivio defaults, subscription, RBAC, and platform rules will apply. Organization data is unchanged.`;
    }
    if (this.disablingOpeningStock()) {
      return `Users in this organization will no longer be able to access or post Opening Stock. Existing stock and historical transactions will not be changed.`;
    }
    if (this.disablingBatches()) {
      return `Users in ${organization} will no longer be able to access Product Batches or its organization Batch inquiry APIs. Existing batches, stock balances, and transaction history will not be deleted or changed. This affects ${organization} only.`;
    }
    if (this.disablingExpiry()) {
      return `Users in ${organization} will no longer be able to access the Expiry Inquiry. Existing batches, expiry information, and stock are not modified. This affects ${organization} only.`;
    }
    if (this.disablingAdjustments()) {
      return `Users in this organization will no longer be able to access or use Stock Adjustments. Existing adjustments, stock movements and inventory balances are not deleted or modified.`;
    }
    if (this.disablingTransfers()) {
      return `Users in this organization will no longer be able to access or use Warehouse Transfers. Existing transfers, stock movements, batches and inventory balances are not deleted or modified.`;
    }
    if (this.disablingReconciliation()) {
      return `Users in this organization will no longer be able to access reconciliation checks. Existing inventory records, movements, balances and cost data are not modified.`;
    }
    if (this.disablingMovements()) {
      return `Users in this organization will no longer be able to access Stock Movements. Existing movement history and inventory records are not modified.`;
    }
    if (this.disablingWarehouses()) {
      return `Users in ${organization} will no longer be able to access Warehouses or manage warehouse definitions. Existing warehouse records, stock history, and movements will not be deleted. This affects ${organization} only.`;
    }
    if (this.disablingCustomers()) {
      return `Users in this organization will no longer be able to access the Customers module or related operational features. Existing customer data, balances, and history will not be deleted.`;
    }
    if (this.disablingSuppliers()) {
      return `Users in this organization will no longer be able to access the Suppliers module or related operational features. Existing supplier data, balances, and history will not be deleted.`;
    }
    if (this.disablingReturns()) {
      return `Users in this organization will no longer be able to access Returns and Corrections or post/reverse returns. Existing posted returns, corrective transactions, stock movements, and ledger history will not be deleted or modified.`;
    }
    if (this.disablingExpenses()) {
      return `Users in this organization will no longer be able to access Expenses or post/correct expenses. Existing posted expenses, corrections, and account movements will not be deleted or modified.`;
    }
    if (this.disablingExpenseCategories()) {
      return `Users in this organization will no longer be able to access the Expense Categories page. Existing categories remain referenced by posted expenses and are not deleted.`;
    }
    if (this.disablingAccounts()) {
      return `Users in this organization will no longer be able to access Accounts, register new accounts, or execute financial movements. Existing accounts, opening balances, movements, and transaction history will not be deleted or modified.`;
    }
    if (this.disablingEmployees()) {
      return `Users in ${organization} will no longer be able to access Employees & Access or manage organization memberships. Existing employee records, roles, assignments, and audit history will not be deleted. This affects ${organization} only.`;
    }
    if (this.disablingReports()) {
      return `Users in ${organization} will no longer be able to open, run, or export Reports. Existing source records and historical data will not be deleted or modified. This affects ${organization} only.`;
    }
    if (this.disablingAlerts()) {
      return `Users in ${organization} will no longer be able to access the Notification Center, alerts, or the navbar notification feed. Existing inventory, ledger, and sales records are not deleted or modified. This affects ${organization} only.`;
    }
    if (this.disablingPurchases()) {
      return `Users in ${organization} will no longer be able to access or operate Purchases. Existing drafts, posted purchases, inventory movements, supplier payables, payments, cancellations, and returns are not deleted or modified. This affects ${organization} only.`;
    }
    if (this.disablingCustomerPayments()) {
      return `Users in ${organization} will no longer be able to access or post Customer Payments. Existing posted payments, allocations, advances, ledger effects, account movements, and corrective history are not deleted or modified. Sales invoices and Accounts remain intact. This affects ${organization} only.`;
    }
    if (this.disablingSupplierPayments()) {
      return `Users in ${organization} will no longer be able to access or post standalone Supplier Payments or open the Supplier Ledger workflow. Existing posted payments, allocations, advances, ledger effects, account movements, and corrective history are not deleted or modified. Purchases remains available. This affects ${organization} only.`;
    }
    if (this.disablingSupplierLedger()) {
      return `Users in ${organization} will no longer be able to open or view the Supplier Ledger & Reconciliation page or access its organization ledger inquiries. Existing posted purchases, supplier payments, allocations, advances, ledger effects, account movements, and corrective history are not deleted or modified. Supplier Payments remains available. This affects ${organization} only.`;
    }
    if (this.disablingSales()) {
      return `Users in ${organization} will no longer be able to access Sales/POS screens or create/manage sales. Existing posted/cancelled sales, stock movements, receivables, payments, returns, account movements, invoice history, and audit records are not deleted or modified. This affects ${organization} only.`;
    }
    if (this.disablingDashboard()) {
      return `Disabling Dashboard for ${organization} will prevent organization users from opening the Dashboard and accessing its operational summary. Existing sales, purchases, inventory, accounts, alerts, and report calculations are not modified. This affects ${organization} only.`;
    }
    if (this.disablingBilling()) {
      return `Users in ${organization} will no longer be able to access the Billing page or submit payment evidence. Subscription lifecycle and platform review workflows remain enforced. This affects ${organization} only.`;
    }
    if (this.disablingSetup()) {
      return `Users in ${organization} will no longer be able to access Organization Setup or its progress API. Existing setup completion facts and destination-module access are not changed. This affects ${organization} only.`;
    }
    if (this.disablingSettings()) {
      return `Users in ${organization} will no longer be able to access Organization Settings or update residual organization settings. Existing organization records and profile data are not deleted. This affects ${organization} only.`;
    }
    const critical = this.changeSummary()
      .filter((change) => change.risk === 'CRITICAL')
      .map((change) => `${change.label}: ${change.before} → ${change.after}`);
    return critical.length > 0
      ? `Critical impact: ${critical.join('; ')}. Changes affect all users in ${organization} only. Existing records are not deleted.`
      : `Changes affect all users in ${organization} only. Permissions, subscription limits, and lifecycle protections remain enforced.`;
  });
  readonly confirmationLabel = computed(() => {
    const pending = this.pendingConfirmation();
    if (pending?.kind === 'reset-control') return 'Reset control';
    if (pending?.kind === 'reset-module') return `Reset ${this.moduleLabel(pending.moduleKey)}`;
    if (pending?.kind === 'reset-organization') return 'Reset all controls';
    if (this.disablingSetup()) return 'Disable Organization Setup';
    if (this.disablingSettings()) return 'Disable Organization Settings';
    if (this.disablingBilling()) return 'Disable Billing';
    if (this.disablingOpeningStock()) return 'Disable Opening Stock';
    if (this.disablingBatches()) return 'Disable Product Batches';
    if (this.disablingExpiry()) return 'Disable Expiry Inquiry';
    if (this.disablingAdjustments()) return 'Disable Stock Adjustments';
    if (this.disablingTransfers()) return 'Disable Warehouse Transfers';
    if (this.disablingReconciliation()) return 'Disable Inventory Reconciliation';
    if (this.disablingMovements()) return 'Disable Stock Movements';
    if (this.disablingBranches()) return 'Disable Branches';
    if (this.disablingWarehouses()) return 'Disable Warehouses';
    if (this.disablingCustomers()) return 'Disable Customers';
    if (this.disablingSuppliers()) return 'Disable Suppliers';
    if (this.disablingReturns()) return 'Disable Returns and Corrections';
    if (this.disablingExpenses()) return 'Disable Expenses';
    if (this.disablingExpenseCategories()) return 'Disable Expense Categories';
    if (this.disablingAccounts()) return 'Disable Accounts';
    if (this.disablingEmployees()) return 'Disable Employees & Access';
    if (this.disablingReports()) return 'Disable Reports';
    if (this.disablingAlerts()) return 'Disable Alerts';
    if (this.disablingPurchases()) return 'Disable Purchases';
    if (this.disablingCustomerPayments()) return 'Disable Customer Payments';
    if (this.disablingSupplierPayments()) return 'Disable Supplier Payments';
    if (this.disablingSupplierLedger()) return 'Disable Supplier Ledger';
    if (this.disablingSales()) return 'Disable Sales';
    if (this.disablingDashboard()) return 'Disable Dashboard';
    return 'Apply changes';
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.getOrganizationPolicy(this.organizationId).subscribe({
      next: (snapshot) => {
        this.snapshot.set(snapshot);
        this.draftValues.set(
          Object.fromEntries(
            snapshot.policy.controls.map((control) => [
              control.key,
              { ...control.configuredValue },
            ]),
          ),
        );
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error));
      },
    });
  }

  selectModule(moduleKey: ConfigurableModule): void {
    this.selectedModule.set(moduleKey);
    this.search.set('');
  }

  modes(control: PlatformCapabilityControl): readonly string[] {
    return Object.keys(control.defaultPolicy);
  }

  value(control: PlatformCapabilityControl, mode: string): boolean {
    return this.draftValues()[control.key]?.[mode] === true;
  }

  isConfigurable(control: PlatformCapabilityControl, mode: string): boolean {
    return control.configurable[mode] === true;
  }

  parentDisabled(control: PlatformCapabilityControl): boolean {
    return (
      control.key !== control.moduleKey &&
      this.draftValues()[control.moduleKey]?.['enabled'] === false
    );
  }

  effectiveValue(control: PlatformCapabilityControl, mode: string): boolean {
    if (
      this.parentDisabled(control) ||
      this.dependencyBlockReason(control) !== null ||
      this.backendRestrictionReason(control) !== null
    ) {
      return false;
    }
    if (control.type === 'FIELD' && mode === 'editable') {
      return this.value(control, 'visible') && this.value(control, mode);
    }
    return this.value(control, mode);
  }

  effectiveReason(control: PlatformCapabilityControl, mode: string): string | null {
    if (this.parentDisabled(control)) {
      return `${this.moduleLabel(control.moduleKey as ConfigurableModule)} is disabled.`;
    }
    const dependencyReason = this.dependencyBlockReason(control);
    if (dependencyReason !== null) return dependencyReason;
    const backendReason = this.backendRestrictionReason(control);
    if (backendReason !== null) return backendReason;
    if (control.type === 'FIELD' && mode === 'editable' && !this.value(control, 'visible')) {
      return 'Hidden fields are read-only.';
    }
    return null;
  }

  setValue(control: PlatformCapabilityControl, mode: string, value: boolean): void {
    if (!this.isConfigurable(control, mode)) return;
    this.draftValues.update((draft) => ({
      ...draft,
      [control.key]: { ...(draft[control.key] ?? {}), [mode]: value },
    }));
    this.successMessage.set(null);
  }

  modeReadonly(control: PlatformCapabilityControl, mode: string): boolean {
    if (this.parentDisabled(control) || this.saving()) return true;
    if (this.dependencyBlockReason(control) !== null) return true;
    return !this.isConfigurable(control, mode);
  }

  modeLockedReason(control: PlatformCapabilityControl, mode: string): string | null {
    if (this.parentDisabled(control)) {
      return `${this.moduleLabel(control.moduleKey as ConfigurableModule)} is disabled for this organization.`;
    }
    const dependencyReason = this.dependencyBlockReason(control);
    if (dependencyReason !== null) return dependencyReason;
    if (control.platformEnforced === true && !this.isConfigurable(control, mode)) {
      if (control.type === 'FEATURE') {
        return 'Platform rule: this required feature cannot be disabled.';
      }
      return 'Platform rule: this required workflow field cannot be hidden or disabled.';
    }
    return null;
  }

  isModeEnabled(control: PlatformCapabilityControl, mode: string): boolean {
    return this.value(control, mode);
  }

  onLabel(mode: string): string {
    return mode === 'editable'
      ? 'Editable'
      : mode === 'allowed'
        ? 'Allowed'
        : mode === 'visible'
          ? 'Visible'
          : 'Enabled';
  }

  offLabel(mode: string): string {
    return mode === 'editable'
      ? 'Read-only'
      : mode === 'allowed'
        ? 'Blocked'
        : mode === 'visible'
          ? 'Hidden'
          : 'Disabled';
  }

  stateLabel(mode: string, value: boolean): string {
    return value ? this.onLabel(mode) : this.offLabel(mode);
  }

  overrideLabel(control: PlatformCapabilityControl, mode: string): string {
    const staged = this.changes().find((change) => change.key === control.key)?.value?.[mode];
    if (staged !== undefined) return `Staged · ${this.stateLabel(mode, staged)}`;
    if (control.override?.[mode] === undefined) return '— Uses default';
    return this.stateLabel(mode, control.override[mode] === true);
  }

  askSave(): void {
    if (this.changes().length > 0) this.pendingConfirmation.set({ kind: 'save' });
  }

  askResetControl(control: PlatformCapabilityControl): void {
    if (control.override !== null) this.pendingConfirmation.set({ kind: 'reset-control', control });
  }

  askResetModule(): void {
    if (this.selectedOverrideCount() > 0) {
      this.pendingConfirmation.set({ kind: 'reset-module', moduleKey: this.selectedModule() });
    }
  }

  askResetOrganization(): void {
    if (this.organizationOverrideCount() > 0) {
      this.pendingConfirmation.set({ kind: 'reset-organization' });
    }
  }

  confirm(): void {
    const pending = this.pendingConfirmation();
    this.pendingConfirmation.set(null);
    if (pending === null || this.saving()) return;
    if (pending.kind === 'save') {
      this.save();
      return;
    }
    const snapshot = this.snapshot();
    if (snapshot === null) return;
    if (pending.kind === 'reset-control') {
      this.runOperation(
        this.api.resetOrganizationControl(
          this.organizationId,
          pending.control.key,
          snapshot.policy.version,
          this.reason(),
        ),
        `${pending.control.label} now uses Agrivio defaults.`,
      );
    } else if (pending.kind === 'reset-module') {
      this.runOperation(
        this.api.resetOrganizationModule(
          this.organizationId,
          pending.moduleKey,
          snapshot.policy.version,
          this.reason(),
        ),
        `${this.moduleLabel(pending.moduleKey)} controls reset to defaults.`,
      );
    } else {
      this.runOperation(
        this.api.resetOrganization(this.organizationId, snapshot.policy.version, this.reason()),
        'Organization controls reset to defaults.',
      );
    }
  }

  moduleLabel(moduleKey: ConfigurableModule): string {
    if (moduleKey === 'inventory.products') return 'Products';
    if (moduleKey === 'inventory.categories') return 'Categories';
    if (moduleKey === 'inventory.stock') return 'Inventory / Stock on Hand';
    if (moduleKey === 'inventory.openingStock') return 'Opening Stock';
    if (moduleKey === 'inventory.expiry') return 'Expiry Inquiry';
    if (moduleKey === 'inventory.adjustments') return 'Stock Adjustments';
    if (moduleKey === 'inventory.transfers') return 'Warehouse Transfers';
    if (moduleKey === 'inventory.reconciliation') return 'Inventory Reconciliation';
    if (moduleKey === 'inventory.movements') return 'Stock Movements';
    if (moduleKey === 'branches') return 'Branches';
    if (moduleKey === 'warehouses') return 'Warehouses';
    if (moduleKey === 'customers') return 'Customers';
    if (moduleKey === 'suppliers') return 'Suppliers';
    if (moduleKey === 'returns') return 'Returns and Corrections';
    if (moduleKey === 'expenses') return 'Expenses';
    if (moduleKey === 'expenses.categories') return 'Expense Categories';
    if (moduleKey === 'accounts') return 'Accounts';
    if (moduleKey === 'employees') return 'Employees & Access';
    if (moduleKey === 'reports') return 'Reports';
    if (moduleKey === 'alerts') return 'Alerts';
    if (moduleKey === 'purchases') return 'Purchases';
    if (moduleKey === 'payments.customer') return 'Customer Payments';
    if (moduleKey === 'payments.supplier') return 'Supplier Payments';
    if (moduleKey === 'payments.supplierLedger') return 'Supplier Ledger';
    if (moduleKey === 'sales') return 'Sales';
    if (moduleKey === 'dashboard') return 'Dashboard';
    if (moduleKey === 'setup') return 'Organization Setup';
    if (moduleKey === 'billing') return 'Billing';
    if (moduleKey === 'settings') return 'Organization Settings';
    return 'Product Batches';
  }

  isPlatformEnforcedFeature(control: PlatformCapabilityControl): boolean {
    return (
      control.type === 'FEATURE' &&
      control.platformEnforced === true &&
      !this.isConfigurable(control, 'enabled')
    );
  }

  showsRequiredEnforcedTreatment(control: PlatformCapabilityControl): boolean {
    return this.isRequiredWorkflowControl(control) || this.isPlatformEnforcedFeature(control);
  }

  isRequiredWorkflowControl(control: PlatformCapabilityControl): boolean {
    return (
      (control.moduleKey === 'inventory.openingStock' ||
        control.moduleKey === 'inventory.batches' ||
        control.moduleKey === 'inventory.expiry' ||
        control.moduleKey === 'inventory.adjustments' ||
        control.moduleKey === 'inventory.transfers' ||
        control.moduleKey === 'inventory.reconciliation' ||
        control.moduleKey === 'inventory.movements' ||
        control.moduleKey === 'branches' ||
        control.moduleKey === 'warehouses' ||
        control.moduleKey === 'customers' ||
        control.moduleKey === 'suppliers' ||
        control.moduleKey === 'returns' ||
        control.moduleKey === 'expenses' ||
        control.moduleKey === 'expenses.categories' ||
        control.moduleKey === 'accounts' ||
        control.moduleKey === 'employees' ||
        control.moduleKey === 'purchases' ||
        control.moduleKey === 'payments.customer' ||
        control.moduleKey === 'payments.supplier' ||
        control.moduleKey === 'payments.supplierLedger' ||
        control.moduleKey === 'sales' ||
        control.moduleKey === 'billing') &&
      control.type === 'FIELD' &&
      control.platformEnforced === true
    );
  }

  private dashboardFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `dashboard.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private setupFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `setup.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private customerPaymentsFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `payments.customer.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private salesFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `sales.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private alertsFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `alerts.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private purchasesFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `purchases.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private supplierPaymentsFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `payments.supplier.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private supplierLedgerFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `payments.supplierLedger.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private accountsFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `accounts.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private employeesFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `employees.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private reportsFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `reports.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }
  private suppliersFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `suppliers.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private branchesFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `branches.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private warehousesFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `warehouses.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private customersFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `customers.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private returnsFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `returns.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private expensesFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `expenses.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private expenseCategoriesFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `expenses.categories.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private movementsFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `inventory.movements.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private reconciliationFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `inventory.reconciliation.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private transfersFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `inventory.transfers.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private adjustmentsFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const keys = new Set(ids.map((id) => `inventory.adjustments.features.${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private batchFeatures(...ids: readonly string[]): readonly PlatformCapabilityControl[] {
    const module = this.selectedModule();
    const prefix =
      module === 'inventory.expiry' ? 'inventory.expiry.features.' : 'inventory.batches.features.';
    const keys = new Set(ids.map((id) => `${prefix}${id}`));
    return this.byType('FEATURE', false).filter((control) => keys.has(control.key));
  }

  private isBatchGroupedFeature(control: PlatformCapabilityControl): boolean {
    return (
      (control.moduleKey === 'inventory.batches' &&
        (control.key === 'inventory.batches.features.moduleInfo' ||
          control.key === 'inventory.batches.features.search' ||
          control.key === 'inventory.batches.features.productFilter' ||
          control.key === 'inventory.batches.features.warehouseFilter' ||
          control.key === 'inventory.batches.features.stockByLocation' ||
          control.key === 'inventory.batches.features.technicalDetails')) ||
      (control.moduleKey === 'inventory.expiry' &&
        (control.key === 'inventory.expiry.features.moduleInfo' ||
          control.key === 'inventory.expiry.features.search' ||
          control.key === 'inventory.expiry.features.productFilter' ||
          control.key === 'inventory.expiry.features.warehouseFilter' ||
          control.key === 'inventory.expiry.features.classificationFilter' ||
          control.key === 'inventory.expiry.features.timelineSection' ||
          control.key === 'inventory.expiry.features.quantitySection' ||
          control.key === 'inventory.expiry.features.technicalDetails')) ||
      (control.moduleKey === 'inventory.adjustments' &&
        (control.key === 'inventory.adjustments.features.moduleInfo' ||
          control.key === 'inventory.adjustments.features.productSearch' ||
          control.key === 'inventory.adjustments.features.productContext' ||
          control.key === 'inventory.adjustments.features.stockContext' ||
          control.key === 'inventory.adjustments.features.guidance' ||
          control.key === 'inventory.adjustments.features.recentAdjustments' ||
          control.key === 'inventory.adjustments.features.serverPostingDate')) ||
      (control.moduleKey === 'inventory.transfers' &&
        (control.key === 'inventory.transfers.features.moduleInfo' ||
          control.key === 'inventory.transfers.features.productSearch' ||
          control.key === 'inventory.transfers.features.productContext' ||
          control.key === 'inventory.transfers.features.stockContext' ||
          control.key === 'inventory.transfers.features.guidance' ||
          control.key === 'inventory.transfers.features.recentTransfers' ||
          control.key === 'inventory.transfers.features.serverTransferDate')) ||
      (control.moduleKey === 'inventory.reconciliation' &&
        (control.key === 'inventory.reconciliation.features.moduleInfo' ||
          control.key === 'inventory.reconciliation.features.search' ||
          control.key === 'inventory.reconciliation.features.warehouseFilter' ||
          control.key === 'inventory.reconciliation.features.findingFilter' ||
          control.key === 'inventory.reconciliation.features.kpiCards' ||
          control.key === 'inventory.reconciliation.features.inspector' ||
          control.key === 'inventory.reconciliation.features.technicalDetails')) ||
      (control.moduleKey === 'inventory.movements' &&
        (control.key === 'inventory.movements.features.moduleInfo' ||
          control.key === 'inventory.movements.features.search' ||
          control.key === 'inventory.movements.features.filters' ||
          control.key === 'inventory.movements.features.kpiCards' ||
          control.key === 'inventory.movements.features.referenceResolution' ||
          control.key === 'inventory.movements.features.inspector' ||
          control.key === 'inventory.movements.features.technicalDetails' ||
          control.key === 'inventory.movements.features.mobileCards')) ||
      (control.moduleKey === 'branches' &&
        (control.key === 'branches.features.moduleInfo' ||
          control.key === 'branches.features.search' ||
          control.key === 'branches.features.statusFilter')) ||
      (control.moduleKey === 'warehouses' &&
        (control.key === 'warehouses.features.moduleInfo' ||
          control.key === 'warehouses.features.search' ||
          control.key === 'warehouses.features.statusFilter')) ||
      (control.moduleKey === 'customers' &&
        (control.key === 'customers.features.moduleInfo' ||
          control.key === 'customers.features.search' ||
          control.key === 'customers.features.statusFilter' ||
          control.key === 'customers.features.kpiCards' ||
          control.key === 'customers.features.inspector' ||
          control.key === 'customers.features.technicalDetails')) ||
      (control.moduleKey === 'suppliers' &&
        (control.key === 'suppliers.features.moduleInfo' ||
          control.key === 'suppliers.features.search' ||
          control.key === 'suppliers.features.statusFilter' ||
          control.key === 'suppliers.features.kpiCards' ||
          control.key === 'suppliers.features.inspector' ||
          control.key === 'suppliers.features.technicalDetails')) ||
      (control.moduleKey === 'returns' &&
        (control.key === 'returns.features.moduleInfo' ||
          control.key === 'returns.features.typeFilter' ||
          control.key === 'returns.features.statusFilter' ||
          control.key === 'returns.features.warehouseFilter')) ||
      (control.moduleKey === 'expenses' &&
        (control.key === 'expenses.features.moduleInfo' ||
          control.key === 'expenses.features.statusFilter' ||
          control.key === 'expenses.features.dateSearch')) ||
      (control.moduleKey === 'expenses.categories' &&
        (control.key === 'expenses.categories.features.moduleInfo' ||
          control.key === 'expenses.categories.features.search' ||
          control.key === 'expenses.categories.features.statusFilter')) ||
      (control.moduleKey === 'accounts' &&
        (control.key === 'accounts.features.moduleInfo' ||
          control.key === 'accounts.features.search' ||
          control.key === 'accounts.features.statusFilter' ||
          control.key === 'accounts.features.movementHistory' ||
          control.key === 'accounts.features.kpiCards')) ||
      (control.moduleKey === 'employees' &&
        (control.key === 'employees.features.moduleInfo' ||
          control.key === 'employees.features.search' ||
          control.key === 'employees.features.statusFilter' ||
          control.key === 'employees.features.roleFilter' ||
          control.key === 'employees.features.kpiCards')) ||
      (control.moduleKey === 'reports' &&
        (control.key === 'reports.features.moduleInfo' ||
          control.key.startsWith('reports.reportAvailability.'))) ||
      (control.moduleKey === 'alerts' &&
        (control.key === 'alerts.features.moduleInfo' ||
          control.key === 'alerts.features.summaryCards' ||
          control.key === 'alerts.features.navbarNotifications' ||
          control.key.startsWith('alerts.alertTypeAvailability.'))) ||
      (control.moduleKey === 'purchases' &&
        (control.key === 'purchases.features.moduleInfo' ||
          control.key === 'purchases.features.search' ||
          control.key === 'purchases.features.statusFilter')) ||
      (control.moduleKey === 'payments.customer' &&
        (control.key === 'payments.customer.features.moduleInfo' ||
          control.key === 'payments.customer.features.search' ||
          control.key === 'payments.customer.features.paymentDateFilter' ||
          control.key === 'payments.customer.features.customerSearch' ||
          control.key === 'payments.customer.features.ledgerPreview')) ||
      (control.moduleKey === 'payments.supplier' &&
        (control.key === 'payments.supplier.features.moduleInfo' ||
          control.key === 'payments.supplier.features.paymentDateFilter')) ||
      (control.moduleKey === 'payments.supplierLedger' &&
        (control.key === 'payments.supplierLedger.features.moduleInfo' ||
          control.key === 'payments.supplierLedger.features.supplierSearch' ||
          control.key === 'payments.supplierLedger.features.reconciliationSummary' ||
          control.key === 'payments.supplierLedger.features.ledgerFilters')) ||
      (control.moduleKey === 'sales' &&
        (control.key === 'sales.features.search' ||
          control.key === 'sales.features.statusFilter' ||
          control.key === 'sales.features.customerSearch' ||
          control.key === 'sales.features.productSearch')) ||
      (control.moduleKey === 'dashboard' &&
        (control.key === 'dashboard.features.datePeriodFilter' ||
          control.key === 'dashboard.features.branchFilter' ||
          control.key === 'dashboard.features.warehouseFilter'))
    );
  }

  private backendRestrictionReason(control: PlatformCapabilityControl): string | null {
    if (control.reasons.includes('subscription_unavailable')) {
      return 'Unavailable on the current subscription state.';
    }
    if (control.reasons.includes('entitlement_unavailable')) {
      return 'Unavailable on the current plan entitlement.';
    }
    if (control.reasons.includes('permission_denied')) {
      return 'Unavailable under the effective RBAC permissions.';
    }
    return null;
  }

  private dependencyBlockReason(control: PlatformCapabilityControl): string | null {
    for (const dependencyKey of control.dependencies ?? []) {
      const dependency = this.controls().find((item) => item.key === dependencyKey);
      if (dependency === undefined) continue;
      const disabled = Object.keys(dependency.defaultPolicy).some(
        (mode) => this.draftValues()[dependency.key]?.[mode] !== true,
      );
      if (!disabled) continue;
      if (dependency.key === 'inventory.products') {
        return 'Products is disabled for this organization.';
      }
      if (dependency.key === 'inventory.stock') {
        return 'Stock on Hand is disabled for this organization.';
      }
      if (dependency.key === 'inventory.batches') {
        return 'Product Batches is disabled for this organization.';
      }
      return `${dependency.label} is disabled for this organization.`;
    }
    return null;
  }

  private save(): void {
    const snapshot = this.snapshot();
    const changes = this.changes();
    if (snapshot === null || changes.length === 0) return;
    this.runOperation(
      this.api.updateOrganizationPolicy(
        this.organizationId,
        snapshot.policy.version,
        changes,
        this.reason(),
      ),
      'Organization capability policy saved.',
    );
  }

  private runOperation(request: Observable<unknown>, success: string): void {
    this.saving.set(true);
    this.errorMessage.set(null);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.successMessage.set(success);
        this.reason.set('');
        this.reload();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error));
      },
    });
  }

  private byType(
    type: CapabilityControlType,
    moduleRoot?: boolean,
  ): readonly PlatformCapabilityControl[] {
    return this.selectedControls().filter(
      (control) =>
        control.type === type &&
        (moduleRoot === undefined || (control.key === control.moduleKey) === moduleRoot),
    );
  }

  private mapError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.error?.error?.code === 'VERSION_CONFLICT') {
        return 'This policy changed elsewhere. Reload and review your changes.';
      }
      return error.error?.error?.message ?? 'Unable to update organization controls.';
    }
    return 'Unable to update organization controls.';
  }
}
