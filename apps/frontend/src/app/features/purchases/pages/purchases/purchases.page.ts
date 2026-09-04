import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { PurchasesApi } from '../../data-access/purchases.api';
import { PurchaseRecord } from '../../models/purchases.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-purchases-page',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './purchases.page.html',
  styleUrl: './purchases.page.scss',
})
export class PurchasesPage {
  private readonly api = inject(PurchasesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly reloadRequests = new Subject<boolean>();
  private readonly searchChanges = new Subject<string>();

  readonly items = signal<PurchaseRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canUsePurchases = computed(
    () => this.capabilityService?.canUseModule('purchases') ?? true,
  );
  readonly canView = computed(
    () => this.sessionStore.hasPermission('purchases.view') && this.canUsePurchases(),
  );
  readonly canCreate = computed(
    () =>
      this.sessionStore.hasPermission('purchases.create') &&
      this.canUsePurchases() &&
      (this.capabilityService?.canPerformAction('purchases.actions.createDraft') ?? true),
  );
  readonly canInspect = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('purchases.actions.inspect') ?? true),
  );
  readonly canEditDraft = computed(
    () =>
      this.sessionStore.hasPermission('purchases.create') &&
      this.canUsePurchases() &&
      (this.capabilityService?.canPerformAction('purchases.actions.editDraft') ?? true),
  );
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseFeature('purchases.features.moduleInfo') ?? true,
  );
  readonly showSearch = computed(
    () => this.capabilityService?.canUseFeature('purchases.features.search') ?? true,
  );
  readonly showStatusFilter = computed(
    () => this.capabilityService?.canUseFeature('purchases.features.statusFilter') ?? true,
  );
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly search = signal('');
  readonly status = signal('');

  readonly moduleInfoItems = [
    'Drafts stay unposted without stock or financial effects until posted.',
    'Posting a purchase creates authoritative inventory movements and payable ledger entries.',
    'Batch and expiry dates are tracked dynamically according to each product tracking mode.',
    'Landed costs and mixed payments at post are supported.',
  ];

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
        startWith(false),
        switchMap((forceRefresh) => {
          if (!this.canView()) {
            this.loading.set(false);
            this.errorMessage.set('You do not have permission to view purchases.');
            return EMPTY;
          }
          this.loading.set(true);
          this.errorMessage.set(null);
          return this.api
            .listPurchases({
              page: this.page(),
              pageSize: this.pageSize(),
              search: this.search(),
              forceRefresh: forceRefresh === true,
              ...(this.status() ? { status: this.status() } : {}),
            })
            .pipe(
              catchError((error: unknown) => {
                this.loading.set(false);
                this.errorMessage.set(
                  error instanceof HttpErrorResponse
                    ? (error.error?.error?.message ?? 'Unable to load purchases.')
                    : 'Unable to load purchases.',
                );
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

  reload(forceRefresh = false): void {
    this.reloadRequests.next(forceRefresh);
  }

  onSearchChange(value: string): void {
    this.searchChanges.next(value);
  }

  onStatusChange(valueOrEvent: string | Event): void {
    const nextStatus =
      typeof valueOrEvent === 'string'
        ? valueOrEvent
        : (valueOrEvent.target as HTMLSelectElement).value;
    this.status.set(nextStatus);
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

  statusTone(status: string): 'warning' | 'success' | 'neutral' {
    if (status === 'draft') {
      return 'warning';
    }
    if (status === 'posted') {
      return 'success';
    }
    return 'neutral';
  }
}
