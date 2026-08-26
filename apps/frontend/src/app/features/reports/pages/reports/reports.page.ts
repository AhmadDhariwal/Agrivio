import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ReportsApi } from '../../data-access/reports.api';
import {
  AuthoritativeTotalItem,
  FilterSelectOption,
  REPORT_CAPABILITY_KEY_BY_REPORT_KEY,
  REPORT_EXPORT_ACTION_BY_FORMAT,
  ReportCatalogItem,
  ReportDataset,
} from '../../models/reports.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import {
  BranchesWarehousesApi,
  BranchRecord,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { CustomerRecord } from '../../../customers/models/customers.models';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { SupplierRecord } from '../../../suppliers/models/suppliers.models';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { CategoryRecord, ProductRecord } from '../../../catalog/models/catalog.models';
import { UsersAccessApi, EmployeeRecord } from '../../../users-access/data-access/users-access.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { formatQuantity } from '../../../../shared/chart/chart-format.util';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-reports-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiModuleInfoComponent,
    UiPaginationComponent,
  ],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPage {
  private readonly api = inject(ReportsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly branchesApi = inject(BranchesWarehousesApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly usersApi = inject(UsersAccessApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly capabilityService = inject(CapabilityService);

  readonly moduleInfoItems = [
    'Fixed Release 1 reports derive calculations directly from source modules (Sales, Purchases, Inventory, Payments, Accounts).',
    'Filters update dynamically based on the selected report family.',
    'Reports and exports enforce organization tenant isolation and RBAC permissions.',
  ];

  readonly catalog = signal<ReportCatalogItem[]>([]);
  readonly selectedKey = signal('sales');
  readonly filters = signal<Record<string, string>>({});
  readonly dataset = signal<ReportDataset | null>(null);
  readonly loading = signal(false);
  readonly catalogLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly exporting = signal(false);
  readonly exportingFormat = signal<string | null>(null);

  // Pagination state (presentation pagination for bounded report datasets)
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizeOptions = [10, 25, 50, 100] as const;

  // Authoritative Lookup Option Stores (lazy loaded on demand per report and cached)
  readonly branches = signal<BranchRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly suppliers = signal<SupplierRecord[]>([]);
  readonly products = signal<ProductRecord[]>([]);
  readonly categories = signal<CategoryRecord[]>([]);
  readonly employees = signal<EmployeeRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);

  private readonly loadedLookups = {
    branches: false,
    warehouses: false,
    customers: false,
    suppliers: false,
    products: false,
    categories: false,
    employees: false,
    accounts: false,
  };

  // Static Enum / Domain Filter Option Lists
  readonly customerTypeOptions: FilterSelectOption[] = [
    { value: '', label: 'All customer types' },
    { value: 'farmer', label: 'Farmer' },
    { value: 'walk_in', label: 'Walk-in' },
    { value: 'individual', label: 'Individual' },
    { value: 'business', label: 'Business' },
    { value: 'corporate', label: 'Corporate' },
  ];

  readonly priceTierOptions: FilterSelectOption[] = [
    { value: '', label: 'All price tiers' },
    { value: 'retail', label: 'Retail' },
    { value: 'wholesale', label: 'Wholesale' },
    { value: 'dealer', label: 'Dealer' },
    { value: 'distributor', label: 'Distributor' },
  ];

  readonly paymentStatusOptions: FilterSelectOption[] = [
    { value: '', label: 'All payment statuses' },
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'partial', label: 'Partial' },
    { value: 'paid', label: 'Paid' },
  ];

  readonly paymentMethodOptions: FilterSelectOption[] = [
    { value: '', label: 'All payment methods' },
    { value: 'cash', label: 'Cash' },
    { value: 'bank', label: 'Bank' },
    { value: 'jazzcash', label: 'JazzCash' },
    { value: 'easypaisa', label: 'Easypaisa' },
  ];

  readonly groupByOptions: FilterSelectOption[] = [
    { value: 'document', label: 'Document' },
    { value: 'product', label: 'Product' },
    { value: 'category', label: 'Category' },
    { value: 'branch', label: 'Branch' },
    { value: 'day', label: 'Day' },
  ];

  readonly hasViewPermission = computed(() => this.sessionStore.hasPermission('reports.view'));
  readonly canView = computed(
    () => this.hasViewPermission() && this.capabilityService.canUseModule('reports'),
  );
  readonly canExport = computed(() => this.sessionStore.hasPermission('reports.export'));
  readonly canShowModuleInfo = computed(() =>
    this.capabilityService.canUseView('reports.features.moduleInfo'),
  );
  readonly suspended = computed(
    () => this.sessionStore.session()?.subscriptionAccessState?.status === 'suspended',
  );
  readonly availableCatalog = computed(() =>
    this.catalog().filter((item) => {
      const capabilityKey = REPORT_CAPABILITY_KEY_BY_REPORT_KEY[item.key];
      return capabilityKey !== undefined && this.capabilityService.canUseView(capabilityKey);
    }),
  );
  readonly selectedReport = computed(
    () => this.availableCatalog().find((item) => item.key === this.selectedKey()) ?? null,
  );

  readonly requiredFilters = computed<string[]>(() => {
    const report = this.selectedReport();
    if (!report) return [];
    const required = report.required ?? [];
    return report.filters.filter((field) => required.includes(field));
  });

  readonly optionalFilters = computed<string[]>(() => {
    const report = this.selectedReport();
    if (!report) return [];
    const required = new Set(report.required ?? []);
    return report.filters.filter((field) => !required.has(field));
  });

  readonly canRunAction = computed(
    () =>
      this.canView() &&
      this.selectedReport() !== null &&
      this.capabilityService.canPerformAction('reports.actions.run'),
  );

  readonly canRunReport = computed<boolean>(() => {
    if (this.loading() || !this.canRunAction()) {
      return false;
    }
    const currentFilters = this.filters();
    const required = this.requiredFilters();
    for (const field of required) {
      const val = currentFilters[field];
      if (typeof val !== 'string' || val.trim() === '') {
        return false;
      }
    }
    const fromDate = currentFilters['fromDate'];
    const toDate = currentFilters['toDate'];
    if (fromDate && toDate && fromDate.trim() !== '' && toDate.trim() !== '') {
      if (fromDate.trim() > toDate.trim()) {
        return false;
      }
    }
    return true;
  });

  readonly totalRows = computed(() => this.dataset()?.rows.length ?? 0);

  readonly paginatedRows = computed(() => {
    const data = this.dataset();
    if (!data || !data.rows) return [];
    const pageNum = this.page();
    const size = this.pageSize();
    const start = (pageNum - 1) * size;
    return data.rows.slice(start, start + size);
  });

  readonly hasAuthoritativeTotals = computed(() => {
    const data = this.dataset();
    if (!data) return false;
    if (data.totals && Object.keys(data.totals).length > 0) return true;
    if (data.summary && Object.keys(data.summary).length > 0) return true;
    return false;
  });

  readonly authoritativeTotalsList = computed<AuthoritativeTotalItem[]>(() => {
    const data = this.dataset();
    if (!data) return [];
    const items: AuthoritativeTotalItem[] = [];

    // If summary breakdown is provided (like gross-profit, customer-ledger), display the breakdown
    if (data.summary && typeof data.summary === 'object' && Object.keys(data.summary).length > 0) {
      for (const [key, value] of Object.entries(data.summary)) {
        if (value && typeof value === 'object' && 'amount' in (value as Record<string, unknown>)) {
          const moneyObj = value as { amount: string; currency?: string };
          items.push({
            key,
            label: this.formatTotalKey(key),
            formattedValue: `PKR ${this.formatMoney(moneyObj.amount)}`,
          });
        } else if (typeof value === 'number' || typeof value === 'string') {
          items.push({
            key,
            label: this.formatTotalKey(key),
            formattedValue: String(value),
          });
        }
      }
    } else if (data.totals && typeof data.totals === 'object') {
      for (const [key, value] of Object.entries(data.totals)) {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          items.push({
            key,
            label: this.formatTotalKey(key),
            formattedValue: `PKR ${this.formatMoney(value)}`,
          });
        }
      }
    }

    return items;
  });

  // Fast Lookup Maps for Rendering Human-Readable Names in Tables
  readonly warehouseMap = computed(() => new Map(this.warehouses().map((w) => [w.id, `${w.name} (${w.code})`])));
  readonly productMap = computed(() => new Map(this.products().map((p) => [p.id, p.name])));
  readonly categoryMap = computed(() => new Map(this.categories().map((c) => [c.id, c.name])));
  readonly customerMap = computed(() => new Map(this.customers().map((c) => [c.id, c.name])));
  readonly supplierMap = computed(() => new Map(this.suppliers().map((s) => [s.id, s.name])));
  readonly employeeMap = computed(() => new Map(this.employees().map((e) => [e.id, e.displayName])));
  readonly accountMap = computed(() => new Map(this.accounts().map((a) => [a.id, `${a.name} (${a.accountType})`])));

  constructor() {
    this.loadCatalog();
  }

  loadCatalog(): void {
    if (!this.canView()) {
      this.catalogLoading.set(false);
      return;
    }
    this.api.listCatalog().subscribe({
      next: (items) => {
        this.catalog.set(items);
        this.catalogLoading.set(false);
        const currentKey = this.selectedKey();
        const available = this.availableCatalog();
        const first = available[0];
        if (first && !available.some((item) => item.key === currentKey)) {
          this.selectedKey.set(first.key);
          this.filters.set(this.getDefaultFiltersForReport(first.key));
          this.ensureLookupsForReport(first.key);
        } else if (currentKey && this.selectedReport() !== null) {
          this.filters.set(this.getDefaultFiltersForReport(currentKey));
          this.ensureLookupsForReport(currentKey);
        } else if (!first) {
          this.selectedKey.set('');
          this.filters.set({});
        }
      },
      error: (error: unknown) => {
        this.catalogLoading.set(false);
        this.errorMessage.set(this.readError(error, 'Unable to load report catalog.'));
      },
    });
  }

  onReportChange(key: string): void {
    const newReport = this.availableCatalog().find((item) => item.key === key);
    if (newReport === undefined) return;
    this.selectedKey.set(key);
    const allowed = new Set(newReport?.filters ?? []);

    // Clean incompatible filters and preserve valid matching ones
    const current = this.filters();
    const updated: Record<string, string> = {};
    for (const [k, val] of Object.entries(current)) {
      if (allowed.has(k) && val.trim() !== '') {
        updated[k] = val;
      }
    }

    // Set authoritative default for groupBy if applicable
    if (allowed.has('groupBy') && !updated['groupBy']) {
      updated['groupBy'] = 'document';
    }

    this.filters.set(updated);
    this.dataset.set(null);
    this.errorMessage.set(null);
    this.page.set(1);
    this.ensureLookupsForReport(key);
  }

  setFilter(field: string, value: string): void {
    this.filters.update((current) => ({ ...current, [field]: value }));
  }

  filterValue(field: string): string {
    return this.filters()[field] ?? '';
  }

  resetFilters(): void {
    const key = this.selectedKey();
    this.filters.set(this.getDefaultFiltersForReport(key));
    this.errorMessage.set(null);
    this.dataset.set(null);
    this.page.set(1);
  }

  run(): void {
    if (!this.canView() || !this.canRunReport()) {
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    const activeFilters = this.getCleanApplicableFilters();

    this.api.getReport(this.selectedKey(), activeFilters).subscribe({
      next: (data) => {
        this.dataset.set(data);
        this.page.set(1);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.dataset.set(null);
        this.errorMessage.set(this.readError(error, 'Unable to load report.'));
      },
    });
  }

  exportFormat(format: string): void {
    if (!this.canExport()) {
      this.errorMessage.set('You do not have permission to export reports.');
      return;
    }
    if (!this.canExportFormat(format)) {
      this.errorMessage.set('This report export format is not available for your organization.');
      return;
    }
    if (!this.canRunReport()) {
      return;
    }
    this.exporting.set(true);
    this.exportingFormat.set(format);
    const activeFilters = this.getCleanApplicableFilters();

    this.api.exportReport(this.selectedKey(), format, activeFilters).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        this.exportingFormat.set(null);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${this.selectedKey()}.${format === 'excel' ? 'xls' : format}`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        this.exportingFormat.set(null);
        this.errorMessage.set(this.readError(error, 'Unable to export report.'));
      },
    });
  }

  onPageChange(nextPage: number): void {
    this.page.set(nextPage);
  }

  onPageSizeChange(nextSize: number): void {
    this.pageSize.set(nextSize);
    this.page.set(1);
  }

  canExportFormat(format: string): boolean {
    const actionKey = REPORT_EXPORT_ACTION_BY_FORMAT[format];
    return (
      this.canView() &&
      this.canExport() &&
      this.selectedReport() !== null &&
      actionKey !== undefined &&
      this.capabilityService.canPerformAction(actionKey)
    );
  }

  // Lazy Lookup Loader: Loads only lookups required by the selected report
  ensureLookupsForReport(reportKey: string): void {
    const report = this.catalog().find((item) => item.key === reportKey);
    const filters = new Set(report?.filters ?? []);

    if (filters.has('branchId') && !this.loadedLookups.branches) {
      this.loadedLookups.branches = true;
      this.branchesApi
        .listBranchOptions()
        .pipe(catchError(() => of([])))
        .subscribe((items) => this.branches.set(items));
    }

    if (filters.has('warehouseId') && !this.loadedLookups.warehouses) {
      this.loadedLookups.warehouses = true;
      this.branchesApi
        .listWarehouseOptions()
        .pipe(catchError(() => of([])))
        .subscribe((items) => this.warehouses.set(items));
    }

    if (filters.has('customerId') && !this.loadedLookups.customers) {
      this.loadedLookups.customers = true;
      this.customersApi
        .searchCustomerOptions('')
        .pipe(catchError(() => of([])))
        .subscribe((items) => this.customers.set(items));
    }

    if (filters.has('supplierId') && !this.loadedLookups.suppliers) {
      this.loadedLookups.suppliers = true;
      this.suppliersApi
        .searchSupplierOptions('')
        .pipe(catchError(() => of([])))
        .subscribe((items) => this.suppliers.set(items));
    }

    if (filters.has('productId') && !this.loadedLookups.products) {
      this.loadedLookups.products = true;
      this.catalogApi
        .searchProductOptions('', 500, 'active')
        .pipe(catchError(() => of([])))
        .subscribe((items) => this.products.set(items));
    }

    if (filters.has('categoryId') && !this.loadedLookups.categories) {
      this.loadedLookups.categories = true;
      this.catalogApi
        .listCategories({ page: 1, pageSize: 100, status: 'active' })
        .pipe(
          map((res) => res.items),
          catchError(() => of([])),
        )
        .subscribe((items) => this.categories.set(items));
    }

    if (filters.has('employeeId') && !this.loadedLookups.employees) {
      this.loadedLookups.employees = true;
      this.usersApi
        .listEmployees({ pageSize: 100 })
        .pipe(
          map((res) => res.items),
          catchError(() => of([])),
        )
        .subscribe((items) => this.employees.set(items));
    }

    if (filters.has('accountId') && !this.loadedLookups.accounts) {
      this.loadedLookups.accounts = true;
      this.accountsApi
        .listAccountOptions()
        .pipe(catchError(() => of([])))
        .subscribe((items) => this.accounts.set(items));
    }
  }

  // Format Helpers
  formatCellValue(columnKey: string, value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    const str = String(value);

    // Money columns
    if (
      [
        'total',
        'cogs',
        'paid',
        'receivable',
        'payable',
        'amount',
        'revenue',
        'inventoryValue',
        'weightedAverageCost',
        'signedAmount',
        'runningBalance',
      ].includes(columnKey)
    ) {
      return this.formatMoney(str);
    }

    // Quantities
    if (['quantityBase', 'unsellableQuantityBase', 'quantity'].includes(columnKey)) {
      return formatQuantity(str);
    }

    // Entity lookups (resolve names from maps when available)
    if (columnKey === 'warehouseId') {
      return this.warehouseMap().get(str) ?? str;
    }
    if (columnKey === 'productId') {
      return this.productMap().get(str) ?? str;
    }
    if (columnKey === 'customerId') {
      return this.customerMap().get(str) ?? str;
    }
    if (columnKey === 'supplierId') {
      return this.supplierMap().get(str) ?? str;
    }
    if (columnKey === 'employeeId') {
      return this.employeeMap().get(str) ?? str;
    }
    if (columnKey === 'accountId') {
      return this.accountMap().get(str) ?? str;
    }

    // Metric humanization
    if (columnKey === 'metric') {
      return this.humanizeMetric(str);
    }

    // Date formatting for ISO strings
    if (columnKey === 'postedAt' || columnKey === 'createdAt') {
      if (str.includes('T')) {
        return str.split('T')[0] ?? str;
      }
    }

    // Account Type humanization
    if (columnKey === 'accountType' || columnKey === 'type') {
      const types: Record<string, string> = {
        cash: 'Cash',
        bank: 'Bank',
        jazzcash: 'JazzCash',
        easypaisa: 'Easypaisa',
      };
      return types[str.toLowerCase()] ?? this.humanizeSnake(str);
    }

    // Effect Kind humanization
    if (columnKey === 'effectKind') {
      const kinds: Record<string, string> = {
        receivable: 'Receivable',
        payable: 'Payable',
        payment: 'Payment',
        credit: 'Credit',
        debit: 'Debit',
      };
      return kinds[str] ?? this.humanizeSnake(str);
    }

    // Source Type humanization
    if (columnKey === 'sourceType') {
      const sources: Record<string, string> = {
        customer_opening_receivable: 'Opening Receivable',
        supplier_opening_payable: 'Opening Payable',
        customer_payment: 'Customer Payment',
        supplier_payment: 'Supplier Payment',
        sale: 'Sale Invoice',
        purchase: 'Purchase',
        sales_return: 'Sales Return',
        purchase_return: 'Purchase Return',
        account_opening: 'Account Opening',
        account_transfer_in: 'Account Transfer In',
        account_transfer_out: 'Account Transfer Out',
        expense: 'Expense Payment',
      };
      return sources[str] ?? this.humanizeSnake(str);
    }

    // Hex ID formatting (e.g. Purchase ID 6a835a6bc5d6f02a711e5d13 -> #11E5D13)
    if (columnKey === 'id' || columnKey === 'purchaseId') {
      if (/^[0-9a-fA-F]{24}$/.test(str)) {
        return `#${str.slice(-6).toUpperCase()}`;
      }
    }

    return str;
  }

  private humanizeSnake(str: string): string {
    return str
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  getColumnHeaderLabel(column: { key: string; label: string }): string {
    const label = column.label;
    if (this.isMoneyColumn(column.key)) {
      if (!label.toLowerCase().includes('pkr') && !label.includes('(')) {
        return `${label} (PKR)`;
      }
    }
    return label;
  }

  isMoneyColumn(key: string): boolean {
    return [
      'total',
      'cogs',
      'paid',
      'receivable',
      'payable',
      'amount',
      'revenue',
      'inventoryValue',
      'weightedAverageCost',
      'signedAmount',
      'runningBalance',
    ].includes(key);
  }

  getKpiTone(key: string): 'green' | 'amber' | 'blue' | 'neutral' {
    const reportKey = this.selectedKey();
    if (reportKey === 'expenses') return 'amber';
    if (['low-stock', 'expiry', 'expiring-lots', 'dead-stock', 'credit-limit', 'negative-margin'].includes(reportKey)) {
      return 'amber';
    }
    if (['grossProfit', 'revenue', 'total', 'netSalesRevenue'].includes(key)) return 'green';
    if (['cogs', 'netCogs', 'payable'].includes(key)) return 'amber';
    if (['inventoryValue', 'openingBalance', 'closingBalance', 'signedAmount'].includes(key)) return 'blue';
    return 'neutral';
  }

  getKpiIconType(key: string): 'money' | 'alert' | 'box' {
    const reportKey = this.selectedKey();
    if (['low-stock', 'expiry', 'expiring-lots', 'dead-stock', 'credit-limit', 'negative-margin'].includes(reportKey) || key === 'count') {
      return 'alert';
    }
    if (['inventoryValue', 'quantity', 'quantityBase'].includes(key)) {
      return 'box';
    }
    return 'money';
  }

  formatMoney(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(num)) return String(value);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  isNumericColumn(key: string): boolean {
    return (
      this.isMoneyColumn(key) ||
      [
        'quantityBase',
        'unsellableQuantityBase',
        'quantity',
        'saleCount',
      ].includes(key)
    );
  }

  isPositiveNumber(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false;
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    return !isNaN(num) && num > 0;
  }

  getFilterLabel(field: string): string {
    const labels: Record<string, string> = {
      fromDate: 'From date',
      toDate: 'To date',
      branchId: 'Branch',
      warehouseId: 'Warehouse',
      customerId: 'Customer',
      supplierId: 'Supplier',
      productId: 'Product',
      categoryId: 'Category',
      employeeId: 'Employee',
      accountId: 'Account',
      customerType: 'Customer type',
      priceTier: 'Price tier',
      paymentStatus: 'Payment status',
      paymentMethod: 'Payment method',
      groupBy: 'Group by',
    };
    return labels[field] ?? field;
  }

  private formatTotalKey(key: string): string {
    const reportKey = this.selectedKey();
    if (key === 'total') {
      if (reportKey === 'sales') return 'Total Sales';
      if (reportKey === 'purchases') return 'Total Purchases';
      if (reportKey === 'expenses') return 'Total Expenses';
      return 'Total Amount';
    }
    if (key === 'amount') {
      if (reportKey === 'expenses') return 'Total Expenses';
      if (reportKey === 'gross-profit') return 'Gross Profit';
      return 'Total Amount';
    }
    if (key === 'count') {
      if (reportKey === 'low-stock') return 'Low Stock Alerts';
      if (reportKey === 'expiry' || reportKey === 'expiring-lots') return 'Expiring Lots';
      if (reportKey === 'dead-stock') return 'Dead Stock Items';
      if (reportKey === 'credit-limit') return 'Credit Limit Breaches';
      if (reportKey === 'negative-margin') return 'Negative Margin Sales';
      return 'Total Alerts';
    }
    const labels: Record<string, string> = {
      amount: 'Amount',
      inventoryValue: 'Inventory Value',
      signedAmount: 'Signed Balance',
      revenue: 'Total Revenue',
      netSalesRevenue: 'Net Sales Revenue',
      netCogs: 'Net COGS',
      grossProfit: 'Gross Profit',
      openingBalance: 'Opening Balance',
      closingBalance: 'Closing Balance',
    };
    return labels[key] ?? key;
  }

  private humanizeMetric(metric: string): string {
    const names: Record<string, string> = {
      netSalesRevenue: 'Net Sales Revenue',
      netCogs: 'Net COGS',
      grossProfit: 'Gross Profit',
    };
    return names[metric] ?? metric;
  }

  private getDefaultFiltersForReport(reportKey: string): Record<string, string> {
    const report = this.catalog().find((item) => item.key === reportKey);
    const defaults: Record<string, string> = {};
    if (report?.filters.includes('groupBy')) {
      defaults['groupBy'] = 'document';
    }
    return defaults;
  }

  private getCleanApplicableFilters(): Record<string, string> {
    const report = this.selectedReport();
    if (!report) return {};
    const allowed = new Set(report.filters);
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.filters())) {
      if (allowed.has(key) && typeof value === 'string' && value.trim() !== '') {
        clean[key] = value.trim();
      }
    }
    return clean;
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message ?? fallback;
    }
    return fallback;
  }
}
