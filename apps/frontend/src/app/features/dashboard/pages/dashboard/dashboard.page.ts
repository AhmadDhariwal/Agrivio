import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DashboardApi } from '../../data-access/dashboard.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { DashboardPayload, MoneyDto } from '../../models/dashboard.models';

@Component({
  selector: 'agrivio-dashboard-page',
  standalone: true,
  imports: [RouterLink, FormsModule, UiPageHeaderComponent, UiAlertComponent, UiLoadingStateComponent],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly dashboardApi = inject(DashboardApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly dashboard = signal<DashboardPayload | null>(null);
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly canView = computed(() => this.sessionStore.hasPermission('dashboard.view'));
  readonly suspended = computed(
    () => this.sessionStore.session()?.subscriptionAccessState?.status === 'suspended',
  );
  readonly activeBranchId = computed(() => this.sessionStore.activeContext()?.branchId ?? '');
  readonly activeWarehouseId = computed(() => this.sessionStore.activeContext()?.warehouseId ?? '');

  constructor() {
    this.reload();
  }

  money(value: MoneyDto | undefined): string {
    if (!value) {
      return '0.00';
    }
    return `${value.amount} ${value.currency}`;
  }

  barWidth(amount: string, maxAmount: string): number {
    const value = Number(amount);
    const max = Number(maxAmount);
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((value / max) * 100));
  }

  maxTrendAmount(): string {
    const data = this.dashboard();
    let max = 0;
    for (const row of data?.salesVsPurchases ?? []) {
      max = Math.max(max, Number(row.sales.amount), Number(row.purchases.amount));
    }
    return String(max);
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
    const branchId = this.activeBranchId();
    const warehouseId = this.activeWarehouseId();
    if (typeof branchId === 'string' && branchId !== '') {
      query.branchId = branchId;
    }
    if (typeof warehouseId === 'string' && warehouseId !== '') {
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
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load dashboard.')
            : 'Unable to load dashboard.',
        );
      },
    });
  }
}
