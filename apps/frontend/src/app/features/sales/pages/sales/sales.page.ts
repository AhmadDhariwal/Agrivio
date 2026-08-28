import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { SalesApi } from '../../data-access/sales.api';
import { MoneyAmount, SaleRecord } from '../../models/sales.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { UiSearchInputComponent } from '../../../../shared/ui/ui-search-input/ui-search-input.component';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-sales-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
    UiSearchInputComponent,
  ],
  templateUrl: './sales.page.html',
  styleUrl: './sales.page.scss',
})
export class SalesPage {
  readonly infoTitle = 'About Sales / POS';
  readonly infoDescription =
    'Create drafts, post cashier sales, and print posted invoices from immutable snapshots.';
  readonly infoItems = [
    'Centralized sales records: View, search, and filter all POS drafts and posted sales.',
    'Immutable & accurate: Posted sales are locked to authoritative inventory, receivable, and financial snapshots.',
    'Invoice printing: Generate formatted 58mm, 80mm receipts or A4 invoices on demand.',
  ];

  private readonly api = inject(SalesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<void>();
  private readonly searchChanges = new Subject<string>();

  readonly items = signal<SaleRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canView = computed(() => this.sessionStore.hasPermission('sales.view'));
  readonly canUseSales = computed(() => this.capabilityService?.canUseModule('sales') ?? true);
  readonly canSearch = computed(
    () => this.capabilityService?.canUseFeature('sales.features.search') ?? true,
  );
  readonly canFilterStatus = computed(
    () => this.capabilityService?.canUseFeature('sales.features.statusFilter') ?? true,
  );
  readonly canCreate = computed(
    () =>
      this.sessionStore.hasPermission('sales.create') &&
      (this.capabilityService?.canPerformAction('sales.actions.createDraft') ?? true),
  );
  readonly canInspect = computed(
    () =>
      this.sessionStore.hasPermission('sales.view') &&
      (this.capabilityService?.canPerformAction('sales.actions.inspect') ?? true),
  );
  readonly canEditDraft = computed(
    () =>
      this.sessionStore.hasPermission('sales.create') &&
      (this.capabilityService?.canPerformAction('sales.actions.editDraft') ?? true),
  );
  readonly canPrint = computed(
    () =>
      this.sessionStore.hasPermission('sales.view') &&
      (this.capabilityService?.canPerformAction('sales.actions.print') ?? true),
  );
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly search = signal('');
  readonly status = signal('');
  readonly hasActiveFilters = computed(() => Boolean(this.search() || this.status()));

  constructor() {
    this.searchChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.search.set(value.trim());
        this.page.set(1);
        this.reload();
      });
    this.reloadRequests
      .pipe(
        startWith(undefined),
        switchMap(() => {
          if (!this.canView() || !this.canUseSales()) {
            this.loading.set(false);
            this.errorMessage.set('You do not have permission to view sales.');
            return EMPTY;
          }
          this.loading.set(true);
          this.errorMessage.set(null);
          const effectiveSearch = this.canSearch() ? this.search() : '';
          const effectiveStatus = this.canFilterStatus() && this.status() ? this.status() : undefined;
          return this.api
            .listSales({
              page: this.page(),
              pageSize: this.pageSize(),
              search: effectiveSearch,
              ...(effectiveStatus ? { status: effectiveStatus } : {}),
            })
            .pipe(
              catchError((error: unknown) => {
                this.handleLoadError(error, 'Unable to load sales.');
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ items, meta }) => {
        this.items.set(items);
        this.total.set(meta.total);
        this.loading.set(false);
      });
  }

  reload(): void {
    this.reloadRequests.next();
  }

  onSearchInput(event: Event): void {
    this.searchChanges.next((event.target as HTMLInputElement).value);
  }

  onSearchClear(): void {
    this.search.set('');
    this.searchChanges.next('');
  }

  onSearchChange(value: string): void {
    this.searchChanges.next(value);
  }

  onStatusChange(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
    this.reload();
  }

  clearFilters(): void {
    this.search.set('');
    this.status.set('');
    this.page.set(1);
    this.reload();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.reload();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.reload();
  }

  private handleLoadError(error: unknown, fallback: string): void {
    this.loading.set(false);
    this.errorMessage.set(
      error instanceof HttpErrorResponse ? (error.error?.error?.message ?? fallback) : fallback,
    );
  }

  formatCurrency(amount?: string | MoneyAmount | null, currency = 'PKR'): string {
    if (!amount) return `${currency} 0.00`;
    const num = typeof amount === 'object' ? Number(amount.amount) : Number(amount);
    const curr = typeof amount === 'object' ? amount.currency || currency : currency;
    if (isNaN(num)) return `${curr} 0.00`;
    return `${curr} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  statusLabel(status: string): string {
    if (status === 'draft') {
      return 'Draft';
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
