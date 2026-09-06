import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, Subject, catchError, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CustomerPaymentsApi,
  CustomerPaymentsListQuery,
} from '../../data-access/customer-payments.api';
import { CustomerPaymentRecord, MoneyAmount } from '../../models/customer-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';

@Component({
  selector: 'agrivio-customer-payments-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiModuleInfoComponent,
    UiPaginationComponent,
  ],
  templateUrl: './customer-payments.page.html',
  styleUrl: './customer-payments.page.scss',
})
export class CustomerPaymentsPage {
  private readonly api = inject(CustomerPaymentsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly reloadRequests = new Subject<boolean>();

  readonly items = signal<CustomerPaymentRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly filterError = signal<string | null>(null);
  readonly canUseCustomerPayments = computed(
    () => this.capabilityService?.canUseModule('payments.customer') ?? true,
  );
  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('customer-payments.view') && this.canUseCustomerPayments(),
  );
  readonly canPost = computed(
    () =>
      this.sessionStore.hasPermission('customer-payments.post') &&
      this.canUseCustomerPayments() &&
      (this.capabilityService?.canPerformAction('payments.customer.actions.post') ?? true),
  );
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseFeature('payments.customer.features.moduleInfo') ?? true,
  );
  readonly showSearch = computed(
    () => this.capabilityService?.canUseFeature('payments.customer.features.search') ?? true,
  );
  readonly showPaymentDateFilter = computed(
    () =>
      this.capabilityService?.canUseFeature('payments.customer.features.paymentDateFilter') ?? true,
  );

  canViewField(id: string): boolean {
    return this.capabilityService?.canViewField(`payments.customer.fields.${id}`) ?? true;
  }

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);

  // Active (applied) filters
  readonly search = signal('');
  readonly dateMode = signal<'single' | 'range'>('single');
  readonly paymentDate = signal('');
  readonly fromDate = signal('');
  readonly toDate = signal('');

  // Staged (pending) filters
  readonly pendingSearch = signal('');
  readonly pendingDateMode = signal<'single' | 'range'>('single');
  readonly pendingPaymentDate = signal('');
  readonly pendingFromDate = signal('');
  readonly pendingToDate = signal('');

  readonly hasActiveFilters = computed(() => {
    if (this.search().trim() !== '') return true;
    if (this.dateMode() === 'single') {
      return this.paymentDate().trim() !== '';
    }
    return this.fromDate().trim() !== '' || this.toDate().trim() !== '';
  });

  readonly hasPendingFilters = computed(() => {
    if (this.pendingSearch().trim() !== '') return true;
    if (this.pendingDateMode() === 'single') {
      return this.pendingPaymentDate().trim() !== '';
    }
    return this.pendingFromDate().trim() !== '' || this.pendingToDate().trim() !== '';
  });

  readonly invalidPendingDateRange = computed(
    () =>
      this.pendingDateMode() === 'range' &&
      this.pendingFromDate() !== '' &&
      this.pendingToDate() !== '' &&
      this.pendingFromDate() > this.pendingToDate(),
  );

  readonly infoTitle = 'About Customer Payments';
  readonly infoDescription =
    'Record money received from customers. Payments reduce outstanding receivable balances or are held as customer advances.';
  readonly infoItems: string[] = [
    'General allocation applies payment to open customer sales starting from the oldest. Any remainder becomes a customer advance.',
    'Invoice-specific allocation applies payment directly to a specified posted sale invoice.',
    'All posted payments create immutable ledger records and affect customer balances.',
  ];

  constructor() {
    this.reloadRequests
      .pipe(
        startWith(false),
        switchMap((forceRefresh) => {
          if (!this.canView()) {
            this.loading.set(false);
            this.errorMessage.set('You do not have permission to view customer payments.');
            return EMPTY;
          }
          this.loading.set(true);
          this.errorMessage.set(null);

          const params: CustomerPaymentsListQuery = {
            page: this.page(),
            pageSize: this.pageSize(),
            forceRefresh: forceRefresh === true,
          };

          const effectiveSearch = this.search().trim();
          if (effectiveSearch) {
            params.search = effectiveSearch;
          }

          if (this.dateMode() === 'single') {
            const effectiveDate = this.paymentDate().trim();
            if (effectiveDate) {
              params.paymentDate = effectiveDate;
            }
          } else {
            const effectiveFrom = this.fromDate().trim();
            const effectiveTo = this.toDate().trim();
            if (effectiveFrom) {
              params.fromDate = effectiveFrom;
            }
            if (effectiveTo) {
              params.toDate = effectiveTo;
            }
          }

          return this.api.listCustomerPayments(params).pipe(
            catchError((error: unknown) => {
              this.loading.set(false);
              this.errorMessage.set(
                error instanceof HttpErrorResponse
                  ? (error.error?.error?.message ?? 'Unable to load customer payments.')
                  : 'Unable to load customer payments.',
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

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.pendingSearch.set(value);
  }

  onSearchClear(): void {
    this.pendingSearch.set('');
    if (this.search()) {
      this.search.set('');
      this.page.set(1);
      this.reload();
    }
  }

  setDateMode(mode: 'single' | 'range'): void {
    this.pendingDateMode.set(mode);
    this.filterError.set(null);
  }

  toggleDateMode(): void {
    this.pendingDateMode.update((mode) => (mode === 'single' ? 'range' : 'single'));
    this.filterError.set(null);
  }

  onPaymentDateInput(value: string): void {
    this.pendingPaymentDate.set(value.trim());
    this.filterError.set(null);
  }

  onFromDateInput(value: string): void {
    this.pendingFromDate.set(value.trim());
    this.filterError.set(null);
  }

  onToDateInput(value: string): void {
    this.pendingToDate.set(value.trim());
    this.filterError.set(null);
  }

  applyFilters(): void {
    if (this.invalidPendingDateRange()) {
      this.filterError.set('From date must be on or before To date.');
      return;
    }
    this.filterError.set(null);
    this.search.set(this.pendingSearch().trim());
    this.dateMode.set(this.pendingDateMode());
    this.paymentDate.set(this.pendingPaymentDate().trim());
    this.fromDate.set(this.pendingFromDate().trim());
    this.toDate.set(this.pendingToDate().trim());
    this.page.set(1);
    this.reload(true);
  }

  clearFilters(): void {
    this.filterError.set(null);
    this.pendingSearch.set('');
    this.pendingPaymentDate.set('');
    this.pendingFromDate.set('');
    this.pendingToDate.set('');
    this.search.set('');
    this.paymentDate.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.page.set(1);
    this.reload(true);
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

  formatCurrency(val?: MoneyAmount | string | number | null): string {
    if (val === undefined || val === null) return 'PKR 0.00';
    if (typeof val === 'object') {
      if (!val.amount) return `${val.currency || 'PKR'} 0.00`;
      const num = Number(val.amount);
      if (isNaN(num)) return `${val.currency || 'PKR'} ${val.amount}`;
      return `${val.currency || 'PKR'} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    const num = Number(val);
    if (isNaN(num)) return `PKR ${val}`;
    return `PKR ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatMode(mode?: string | null): string {
    if (!mode) return 'General';
    if (mode === 'invoice_specific') return 'Invoice-specific';
    if (mode === 'general') return 'General';
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  }

  getStatusTone(status?: string | null): 'success' | 'warning' | 'neutral' | 'danger' {
    if (!status) return 'neutral';
    const s = status.toLowerCase();
    if (s === 'posted') return 'success';
    if (s === 'draft') return 'warning';
    if (s === 'cancelled' || s === 'reversed') return 'danger';
    return 'neutral';
  }
}
