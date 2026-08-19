import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
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
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiSearchInputComponent } from '../../../../shared/ui/ui-search-input/ui-search-input.component';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
    UiPaginationComponent,
    UiSearchInputComponent,
  ],
  templateUrl: './sales.page.html',
  styleUrl: './sales.page.scss',
})
export class SalesPage {
  private readonly api = inject(SalesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<void>();
  private readonly searchChanges = new Subject<string>();

  readonly items = signal<SaleRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canView = computed(() => this.sessionStore.hasPermission('sales.view'));
  readonly canCreate = computed(() => this.sessionStore.hasPermission('sales.create'));
  readonly page = signal(1); readonly pageSize = signal(25); readonly total = signal(0);
  readonly search = signal(''); readonly status = signal('');

  constructor() {
    this.searchChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => { this.search.set(value.trim()); this.page.set(1); this.reload(); });
    this.reloadRequests.pipe(startWith(undefined), switchMap(() => {
      if (!this.canView()) { this.loading.set(false); this.errorMessage.set('You do not have permission to view sales.'); return EMPTY; }
      this.loading.set(true); this.errorMessage.set(null);
      return this.api.listSales({ page: this.page(), pageSize: this.pageSize(), search: this.search(), ...(this.status() ? { status: this.status() } : {}) })
        .pipe(catchError((error: unknown) => { this.handleLoadError(error, 'Unable to load sales.'); return EMPTY; }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe(({ items, meta }) => {
      this.items.set(items); this.total.set(meta.total); this.loading.set(false);
    });
  }

  reload(): void {
    this.reloadRequests.next();
  }
  onSearchChange(value: string): void { this.searchChanges.next(value); }
  onStatusChange(event: Event): void { this.status.set((event.target as HTMLSelectElement).value); this.page.set(1); this.reload(); }
  onPageChange(page: number): void { this.page.set(page); this.reload(); }
  onPageSizeChange(size: number): void { this.pageSize.set(size); this.page.set(1); this.reload(); }
  private handleLoadError(error: unknown, fallback: string): void {
    this.loading.set(false); this.errorMessage.set(error instanceof HttpErrorResponse ? (error.error?.error?.message ?? fallback) : fallback);
  }

  statusLabel(status: string): string {
    if (status === 'draft') {
      return 'Draft (unposted)';
    }
    if (status === 'posted') {
      return 'Posted';
    }
    if (status === 'cancelled') {
      return 'Cancelled';
    }
    return status;
  }

  actionLabel(status: string): string {
    if (status === 'posted' || status === 'cancelled') {
      return 'View';
    }
    return 'Edit draft';
  }

  statusTone(status: string): 'warning' | 'success' | 'neutral' | 'danger' {
    if (status === 'draft') {
      return 'warning';
    }
    if (status === 'posted') {
      return 'success';
    }
    if (status === 'cancelled') {
      return 'danger';
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
