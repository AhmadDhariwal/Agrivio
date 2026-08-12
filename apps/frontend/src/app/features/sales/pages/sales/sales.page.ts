import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { SalesApi } from '../../data-access/sales.api';
import { SaleRecord } from '../../models/sales.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-sales-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './sales.page.html',
  styleUrl: './sales.page.scss',
})
export class SalesPage {
  private readonly api = inject(SalesApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<SaleRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canView = computed(() => this.sessionStore.hasPermission('sales.view'));
  readonly canCreate = computed(() => this.sessionStore.hasPermission('sales.create'));

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view sales.');
      return;
    }
    this.loading.set(true);
    this.api.listSales().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load sales.')
            : 'Unable to load sales.',
        );
      },
    });
  }

  statusLabel(status: string): string {
    if (status === 'draft') {
      return 'Draft (unposted)';
    }
    if (status === 'posted') {
      return 'Posted';
    }
    return status;
  }

  actionLabel(status: string): string {
    return status === 'posted' ? 'View' : 'Edit draft';
  }

  statusTone(status: string): 'warning' | 'success' | 'neutral' {
    if (status === 'draft') {
      return 'warning';
    }
    if (status === 'posted') {
      return 'success';
    }
    return 'neutral';
  }

  displayTitle(item: SaleRecord): string {
    if (item.customerNameSnapshot) {
      return item.customerNameSnapshot;
    }
    return 'Walk-in sale';
  }
}
