import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, forkJoin, of } from 'rxjs';
import { ReturnsApi } from '../../data-access/returns.api';
import { SalesReturnRecord, returnTypeLabel } from '../../models/returns.models';
import {
  BranchesWarehousesApi,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-returns-list-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './returns-list.page.html',
  styleUrl: './returns-list.page.scss',
})
export class ReturnsListPage {
  private readonly api = inject(ReturnsApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<SalesReturnRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canView = computed(() => this.sessionStore.hasPermission('returns.view'));
  readonly canPost = computed(() => this.sessionStore.hasPermission('returns.post'));
  readonly canApproveWithoutInvoice = computed(() =>
    this.sessionStore.hasPermission('returns.without-invoice.approve'),
  );
  readonly canReverse = computed(() => this.sessionStore.hasPermission('returns.reverse'));
  readonly reverseReason = signal('');
  readonly reversingId = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  constructor() {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      items: this.api.listReturns(),
      warehouses: this.locationsApi.listWarehouses().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ items, warehouses }) => {
        this.items.set(items);
        this.warehouses.set(warehouses);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error, 'Unable to load returns.'));
        this.loading.set(false);
      },
    });
  }

  typeLabel(returnType: string): string {
    return returnTypeLabel(returnType);
  }

  warehouseName(id: string): string {
    return this.warehouses().find((item) => item.id === id)?.name ?? 'Warehouse';
  }

  productLabel(item: SalesReturnRecord): string {
    return item.lines[0]?.productNameSnapshot ?? 'Return';
  }

  statusTone(status: string): 'success' | 'warning' | 'neutral' {
    if (status === 'posted') {
      return 'success';
    }
    if (status === 'reversed') {
      return 'warning';
    }
    return 'neutral';
  }

  reverse(item: SalesReturnRecord): void {
    if (!this.canReverse() || item.status !== 'posted' || this.reversingId()) {
      return;
    }
    const reason = this.reverseReason().trim();
    if (reason === '') {
      this.errorMessage.set('A reversal reason is required.');
      return;
    }
    this.reversingId.set(item.id);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api
      .reverseReturn(
        item.id,
        { reason, expectedVersion: item.version },
        `return-reverse-${item.id}-${Date.now()}`,
      )
      .subscribe({
        next: (updated) => {
          this.items.update((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
          this.reversingId.set(null);
          this.reverseReason.set('');
          this.successMessage.set('Return reversed with a linked corrective transaction.');
        },
        error: (error: unknown) => {
          this.reversingId.set(null);
          this.errorMessage.set(this.mapError(error, 'Unable to reverse return.'));
        },
      });
  }

  onReverseReasonInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.reverseReason.set(target.value);
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.status === 403) {
      return error.error?.error?.message ?? 'You do not have permission for this action.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
