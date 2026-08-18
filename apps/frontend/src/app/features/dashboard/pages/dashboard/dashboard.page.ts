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
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLineChartComponent } from '../../../../shared/chart/ui-line-chart.component';
import { UiHorizontalBarChartComponent } from '../../../../shared/chart/ui-horizontal-bar-chart.component';
import { UiDonutChartComponent } from '../../../../shared/chart/ui-donut-chart.component';
import { ChartPoint, ChartSeries, formatPkrAmount, formatQuantity, parseAmount } from '../../../../shared/chart/chart-format.util';
import { DashboardPayload, MoneyDto } from '../../models/dashboard.models';

@Component({
  selector: 'agrivio-dashboard-page',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiEmptyStateComponent,
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

  readonly salesPurchaseSeries: ChartSeries[] = [
    { key: 'sales', label: 'Sales', color: 'var(--ag-color-primary, #1f6b3a)' },
    { key: 'purchases', label: 'Purchases', color: 'var(--ag-color-accent, #8a6a2f)' },
  ];
  readonly grossProfitSeries: ChartSeries[] = [
    { key: 'grossProfit', label: 'Gross profit', color: 'var(--ag-color-primary-strong, #14532d)' },
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

  readonly accountDonutSlices = computed(() =>
    (this.dashboard()?.accountDistribution ?? []).map((item, index) => ({
      label: item.label,
      value: item.balance.amount,
      color: ['#1f6b3a', '#2563eb', '#8a6a2f', '#0f766e'][index % 4] ?? '#1f6b3a',
    })),
  );

  readonly expiryBars = computed(() => {
    const data = this.dashboard();
    if (!data) {
      return [];
    }
    return [
      { label: 'Upcoming expiry', value: String(data.upcomingExpiryCount) },
      { label: 'Expired stock', value: String(data.expiredStockCount) },
    ];
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
    if (!this.canView()) {
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

  reload(): void {
    if (!this.canView()) {
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
    if (this.fromDate().trim() !== '') {
      query.fromDate = this.fromDate().trim();
    }
    if (this.toDate().trim() !== '') {
      query.toDate = this.toDate().trim();
    }
    const branchId = this.branchId().trim();
    const warehouseId = this.warehouseId().trim();
    if (branchId !== '') {
      query.branchId = branchId;
    }
    if (warehouseId !== '') {
      query.warehouseId = warehouseId;
    }
    this.dashboardApi.getDashboard(query).subscribe({
      next: (data) => {
        this.dashboard.set(data);
        if (this.fromDate() === '' && data.period?.fromDate) {
          this.fromDate.set(data.period.fromDate);
        }
        if (this.toDate() === '' && data.period?.toDate) {
          this.toDate.set(data.period.toDate);
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
