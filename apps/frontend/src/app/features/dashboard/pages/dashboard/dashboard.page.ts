import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DashboardApi } from '../../data-access/dashboard.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import {
  BranchesWarehousesApi,
  BranchRecord,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiLineChartComponent } from '../../../../shared/chart/ui-line-chart.component';
import { UiHorizontalBarChartComponent } from '../../../../shared/chart/ui-horizontal-bar-chart.component';
import { UiDonutChartComponent } from '../../../../shared/chart/ui-donut-chart.component';
import {
  ChartPoint,
  ChartSeries,
  formatPkrAmount,
  formatQuantity,
  parseAmount,
} from '../../../../shared/chart/chart-format.util';
import { DashboardPayload, MoneyDto } from '../../models/dashboard.models';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-dashboard-page',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiEmptyStateComponent,
    UiStatusBadgeComponent,
    UiLineChartComponent,
    UiHorizontalBarChartComponent,
    UiDonutChartComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly dashboardApi = inject(DashboardApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly loading = signal(true);
  readonly filtersLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly dashboard = signal<DashboardPayload | null>(null);
  readonly branches = signal<BranchRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly branchId = signal('');
  readonly warehouseId = signal('');

  readonly canView = computed(() => this.sessionStore.hasPermission('dashboard.view'));
  readonly suspended = computed(
    () => this.sessionStore.session()?.subscriptionAccessState?.status === 'suspended',
  );

  // Authoritative Dashboard capability signals
  readonly canUseDashboard = computed(
    () => this.capabilityService?.canUseModule('dashboard') ?? true,
  );
  readonly canUseDateFilter = computed(
    () => this.capabilityService?.canUseFeature('dashboard.features.datePeriodFilter') ?? true,
  );
  readonly canUseBranchFilter = computed(
    () => this.capabilityService?.canUseFeature('dashboard.features.branchFilter') ?? true,
  );
  readonly canUseWarehouseFilter = computed(
    () => this.capabilityService?.canUseFeature('dashboard.features.warehouseFilter') ?? true,
  );
  readonly hasAnyFilterEnabled = computed(
    () => this.canUseDateFilter() || this.canUseBranchFilter() || this.canUseWarehouseFilter(),
  );

  readonly canShowFinancialSummary = computed(
    () => this.capabilityService?.canShowWidget('dashboard.widgets.financialSummary') ?? true,
  );
  readonly canShowAccountSummary = computed(
    () => this.capabilityService?.canShowWidget('dashboard.widgets.accountSummary') ?? true,
  );
  readonly canShowSalesVsPurchasesTrend = computed(
    () => this.capabilityService?.canShowWidget('dashboard.widgets.salesVsPurchasesTrend') ?? true,
  );
  readonly canShowGrossProfitTrend = computed(
    () => this.capabilityService?.canShowWidget('dashboard.widgets.grossProfitTrend') ?? true,
  );
  readonly canShowTopSellingProducts = computed(
    () => this.capabilityService?.canShowWidget('dashboard.widgets.topSellingProducts') ?? true,
  );
  readonly canShowInventoryHealth = computed(
    () => this.capabilityService?.canShowWidget('dashboard.widgets.inventoryHealth') ?? true,
  );
  readonly canShowRecentSales = computed(
    () => this.capabilityService?.canShowWidget('dashboard.widgets.recentSales') ?? true,
  );
  readonly hasAnyWidgetEnabled = computed(
    () =>
      this.canShowFinancialSummary() ||
      this.canShowAccountSummary() ||
      this.canShowSalesVsPurchasesTrend() ||
      this.canShowGrossProfitTrend() ||
      this.canShowTopSellingProducts() ||
      this.canShowInventoryHealth() ||
      this.canShowRecentSales(),
  );

  readonly hasSecondaryCards = computed(() => {
    const data = this.dashboard();
    if (!data) return false;
    const hasFinancial =
      this.canShowFinancialSummary() &&
      (data.supplierPayables !== undefined || data.stockValuation !== undefined);
    const hasAccounts =
      this.canShowAccountSummary() &&
      (data.cashBalances !== undefined ||
        data.bankBalances !== undefined ||
        data.jazzCashBalance !== undefined ||
        data.easypaisaBalance !== undefined);
    return hasFinancial || hasAccounts;
  });

  // Authoritative RBAC permissions for navigation links
  readonly canViewSales = computed(() => this.sessionStore.hasPermission('sales.view'));
  readonly canViewPurchases = computed(() => this.sessionStore.hasPermission('purchases.view'));
  readonly canViewExpenses = computed(() => this.sessionStore.hasPermission('expenses.view'));
  readonly canViewCustomers = computed(() => this.sessionStore.hasPermission('customers.view'));
  readonly canViewSuppliers = computed(() => this.sessionStore.hasPermission('suppliers.view'));
  readonly canViewAccounts = computed(() => this.sessionStore.hasPermission('accounts.view'));
  readonly canViewInventory = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canViewAlerts = computed(() => this.sessionStore.hasPermission('alerts.view'));
  readonly canViewReports = computed(() => this.sessionStore.hasPermission('reports.view'));

  readonly hasActiveFilters = computed(() => {
    const data = this.dashboard();
    const hasBranch = this.canUseBranchFilter() && this.branchId().trim() !== '';
    const hasWarehouse = this.canUseWarehouseFilter() && this.warehouseId().trim() !== '';
    const defaultFrom = data?.period?.fromDate ?? '';
    const defaultTo = data?.period?.toDate ?? '';
    const hasCustomFrom =
      this.canUseDateFilter() &&
      this.fromDate().trim() !== '' &&
      this.fromDate().trim() !== defaultFrom;
    const hasCustomTo =
      this.canUseDateFilter() &&
      this.toDate().trim() !== '' &&
      this.toDate().trim() !== defaultTo;
    return hasBranch || hasWarehouse || hasCustomFrom || hasCustomTo;
  });

  readonly salesPurchaseSeries: ChartSeries[] = [
    { key: 'sales', label: 'Sales', color: '#065f46' },
    { key: 'purchases', label: 'Purchases', color: '#2563eb' },
  ];

  readonly grossProfitSeries: ChartSeries[] = [
    { key: 'grossProfit', label: 'Gross Profit', color: '#065f46' },
  ];

  readonly formatPkrAmount = formatPkrAmount;
  readonly formatQuantity = formatQuantity;

  readonly salesVsPurchasePoints = computed<ChartPoint[]>(() => {
    const rows = this.dashboard()?.salesVsPurchases ?? [];
    return rows.map((row) => ({
      label: row.date,
      values: {
        sales: parseAmount(row.sales.amount),
        purchases: parseAmount(row.purchases.amount),
      },
    }));
  });

  readonly grossProfitPoints = computed<ChartPoint[]>(() => {
    const rows = this.dashboard()?.grossProfitTrend ?? [];
    return rows.map((row) => ({
      label: row.date,
      values: {
        grossProfit: parseAmount(row.grossProfit.amount),
      },
    }));
  });

  readonly topProductBars = computed(() =>
    (this.dashboard()?.topSellingProducts ?? []).map((product) => ({
      label: product.productName,
      value: product.quantityBase,
      detail: formatPkrAmount(product.revenue.amount),
      href: `/app/products/${product.productId}`,
    })),
  );

  readonly accountDonutSlices = computed(() => {
    const palette = ['#065f46', '#2563eb', '#d97706', '#7c3aed', '#0891b2'];
    return (this.dashboard()?.accountDistribution ?? []).map((item, index) => ({
      label: item.label,
      value: item.balance.amount,
      color: palette[index % palette.length] ?? '#065f46',
    }));
  });

  readonly totalAccountBalance = computed(() => {
    const items = this.dashboard()?.accountDistribution ?? [];
    let sum = 0;
    for (const item of items) {
      const parsed = parseAmount(item.balance.amount);
      if (Number.isFinite(parsed)) {
        sum += parsed;
      }
    }
    return sum;
  });

  constructor() {
    this.loadFilters();
    this.reload();
  }

  formatMoney(value: MoneyDto | null | undefined): string {
    if (!value) {
      return 'Unavailable';
    }
    return formatPkrAmount(value.amount);
  }

  formatCount(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return 'Unavailable';
    }
    return formatQuantity(value);
  }

  loadFilters(): void {
    if (!this.canView() || !this.canUseDashboard() || (!this.canUseBranchFilter() && !this.canUseWarehouseFilter())) {
      this.filtersLoading.set(false);
      return;
    }
    this.filtersLoading.set(true);
    forkJoin({
      branches: this.locationsApi.listBranchOptions().pipe(catchError(() => of([] as BranchRecord[]))),
      warehouses: this.locationsApi.listWarehouseOptions().pipe(catchError(() => of([] as WarehouseRecord[]))),
    }).subscribe({
      next: ({ branches, warehouses }) => {
        this.branches.set(branches.filter((item) => item.status === 'active'));
        this.warehouses.set(warehouses.filter((item) => item.status === 'active'));
        this.filtersLoading.set(false);
      },
      error: () => {
        this.filtersLoading.set(false);
      },
    });
  }

  clearFilters(): void {
    if (this.canUseBranchFilter()) {
      this.branchId.set('');
    }
    if (this.canUseWarehouseFilter()) {
      this.warehouseId.set('');
    }
    if (this.canUseDateFilter()) {
      const data = this.dashboard();
      if (data?.period?.fromDate) {
        this.fromDate.set(data.period.fromDate);
      } else {
        this.fromDate.set('');
      }
      if (data?.period?.toDate) {
        this.toDate.set(data.period.toDate);
      } else {
        this.toDate.set('');
      }
    }
    this.reload();
  }

  reload(): void {
    if (!this.canView() || !this.canUseDashboard()) {
      this.loading.set(false);
      return;
    }
    if (this.suspended()) {
      this.loading.set(false);
      this.dashboard.set(null);
      this.errorMessage.set(
        'Subscription is suspended. The operational dashboard is blocked until reactivation. Historical reports and entitled exports remain available.',
      );
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    const query: {
      fromDate?: string;
      toDate?: string;
      branchId?: string;
      warehouseId?: string;
    } = {};
    if (this.canUseDateFilter()) {
      if (this.fromDate().trim() !== '') {
        query.fromDate = this.fromDate().trim();
      }
      if (this.toDate().trim() !== '') {
        query.toDate = this.toDate().trim();
      }
    }
    if (this.canUseBranchFilter()) {
      const branchId = this.branchId().trim();
      if (branchId !== '') {
        query.branchId = branchId;
      }
    }
    if (this.canUseWarehouseFilter()) {
      const warehouseId = this.warehouseId().trim();
      if (warehouseId !== '') {
        query.warehouseId = warehouseId;
      }
    }
    this.dashboardApi.getDashboard(query).subscribe({
      next: (data) => {
        this.dashboard.set(data);
        if (this.canUseDateFilter()) {
          if (this.fromDate() === '' && data.period?.fromDate) {
            this.fromDate.set(data.period.fromDate);
          }
          if (this.toDate() === '' && data.period?.toDate) {
            this.toDate.set(data.period.toDate);
          }
        }
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.dashboard.set(null);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load dashboard.')
            : 'Unable to load dashboard.',
        );
      },
    });
  }
}
