import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, Subject, catchError, debounceTime, merge, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CustomerPaymentsApi,
  CustomerPaymentsListQuery,
} from '../../data-access/customer-payments.api';
import { CustomerPaymentRecord, MoneyAmount } from '../../models/customer-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiSearchableDropdownComponent, DropdownOption } from '../../../../shared/ui/ui-searchable-dropdown/ui-searchable-dropdown.component';
import { formatCustomerOption } from '../../../../shared/ui/ui-searchable-dropdown/entity-dropdown-formatters';
import { AppDatePipe } from '../../../../shared/format/date-time.pipe';
import { getAppliedToLabel } from './customer-payments-presentation.util';
import type { CustomerRecord } from '../../../customers/models/customers.models';
import {
  PaymentCorrectionDialogComponent,
  PaymentCorrectionDialogResult,
  PaymentCorrectionTarget,
} from '../../../../shared/ui/payment-correction-dialog/payment-correction-dialog.component';
import { PaymentDetailDialogComponent } from '../../../../shared/ui/payment-detail-dialog/payment-detail-dialog.component';
import { PaymentCorrectionInput } from '../../models/customer-payments.models';

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
    UiSearchableDropdownComponent,
    AppDatePipe,
    PaymentCorrectionDialogComponent,
    PaymentDetailDialogComponent,
  ],
  templateUrl: './customer-payments.page.html',
  styleUrl: './customer-payments.page.scss',
})
export class CustomerPaymentsPage {
  private readonly api = inject(CustomerPaymentsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly customersApi = inject(CustomersApi);
  private readonly reloadRequests = new Subject<boolean>();
  private readonly customerSearchImmediate = new Subject<string>();
  private readonly customerSearchChanges = new Subject<string>();
  private readonly knownCustomers = new Map<string, CustomerRecord>();

  /** Customer option state (for the customer filter dropdown). */
  private readonly customerRecords = signal<CustomerRecord[]>([]);
  /**
   * Tracks which customer option label is currently committed (applied) to the
   * filter, so it survives subsequent searches.
   */
  private selectedCustomerLabel = signal<string>('');

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
  readonly canViewCustomers = computed(
    () =>
      this.sessionStore.hasPermission('customers.view') &&
      (this.capabilityService?.canUseModule('customers') ?? true),
  );
  readonly canPost = computed(
    () =>
      this.sessionStore.hasPermission('customer-payments.post') &&
      this.canUseCustomerPayments() &&
      (this.capabilityService?.canPerformAction('payments.customer.actions.post') ?? true),
  );
  readonly canCorrect = computed(
    () =>
      this.sessionStore.hasPermission('payments.correct') &&
      this.canUseCustomerPayments() &&
      (this.capabilityService?.canPerformAction('payments.customer.actions.correct') ?? true),
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
  /** Applied customer ID for the active filter. */
  readonly customerId = signal<string>('');

  // Staged (pending) filters
  readonly pendingSearch = signal('');
  readonly pendingDateMode = signal<'single' | 'range'>('single');
  readonly pendingPaymentDate = signal('');
  readonly pendingFromDate = signal('');
  readonly pendingToDate = signal('');
  /** Staged customer ID before the user clicks Apply. */
  readonly pendingCustomerId = signal<string>('');

  /** Options for the customer dropdown (updated by the search stream).
   * If the currently-selected customer is not in the fetched results (e.g.
   * because the user searched for something else), it is prepended from the
   * knownCustomers cache so the selection label never disappears.
   */
  readonly customerOptions = computed<DropdownOption[]>(() => {
    const records = this.customerRecords();
    const selectedId = this.pendingCustomerId();
    if (selectedId && !records.some((c) => c.id === selectedId)) {
      const known = this.knownCustomers.get(selectedId);
      if (known) {
        return [formatCustomerOption(known), ...records.map(formatCustomerOption)];
      }
    }
    return records.map(formatCustomerOption);
  });

  /** Currently-selected label that persists across customer search changes. */
  readonly selectedCustomerDisplayLabel = computed(() => this.selectedCustomerLabel());

  readonly hasActiveFilters = computed(() => {
    if (this.search().trim() !== '') return true;
    if (this.customerId()) return true;
    if (this.dateMode() === 'single') {
      return this.paymentDate().trim() !== '';
    }
    return this.fromDate().trim() !== '' || this.toDate().trim() !== '';
  });

  readonly hasPendingFilters = computed(() => {
    if (this.pendingSearch().trim() !== '') return true;
    if (this.pendingCustomerId()) return true;
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
    // Boot the customer dropdown with all active customers immediately.
    // Two-channel design:
    //  - customerSearchImmediate: bypasses debounce for open/clear events.
    //  - customerSearchChanges:   debounced for user keystrokes.
    // distinctUntilChanged is intentionally omitted from both channels so that:
    //  (a) reopening the dropdown always triggers a fresh fetch even if the
    //      last query was also '' and
    //  (b) re-searching the same term after a clear works correctly.
    // switchMap naturally cancels stale in-flight requests.
    merge(
      this.customerSearchImmediate,
      this.customerSearchChanges.pipe(debounceTime(300)),
    )
      .pipe(
        switchMap((query) => this.customersApi.searchCustomerOptions(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        for (const item of items) {
          this.knownCustomers.set(item.id, item);
        }
        this.customerRecords.set(items.filter((c) => c.status === 'active'));
      });

    this.customerSearchImmediate.next('');

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

          const effectiveCustomerId = this.customerId();
          if (effectiveCustomerId) {
            params.customerId = effectiveCustomerId;
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
        // Clamp page to valid bounds if the server returns fewer pages.
        const maxPage = meta.total > 0 ? Math.ceil(meta.total / meta.pageSize) : 1;
        if (this.page() > maxPage) {
          this.page.set(maxPage);
        }
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

  /** Called when the user types in the customer searchable dropdown. */
  onCustomerSearch(query: string): void {
    const trimmed = (query ?? '').trim();
    if (!trimmed) {
      // Empty query (search cleared): fetch immediately without waiting for debounce.
      this.customerSearchImmediate.next('');
    } else {
      this.customerSearchChanges.next(trimmed);
    }
  }

  /** Called when the customer dropdown opens or closes. */
  onCustomerDropdownOpenChange(open: boolean): void {
    if (open) {
      // Always re-fetch the full list on open, even if the last query was also
      // ''. The immediate Subject bypasses any deduplication so this always
      // triggers a fresh API call.
      this.customerSearchImmediate.next('');
    }
  }

  /**
   * Called when the user selects (or clears) a customer in the dropdown.
   * Sets the pending customer ID and persists the label so it survives
   * subsequent search queries.
   */
  onCustomerChange(value: string | null): void {
    const id = value ?? '';
    this.pendingCustomerId.set(id);
    if (id) {
      const found =
        this.knownCustomers.get(id) ??
        this.customerRecords().find((c) => c.id === id);
      if (found) {
        this.knownCustomers.set(id, found);
      }
      this.selectedCustomerLabel.set(found?.name ?? id);
    } else {
      this.selectedCustomerLabel.set('');
    }
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
    this.customerId.set(this.pendingCustomerId());
    this.page.set(1);
    this.reload(true);
  }

  clearFilters(): void {
    this.filterError.set(null);
    this.pendingSearch.set('');
    this.pendingPaymentDate.set('');
    this.pendingFromDate.set('');
    this.pendingToDate.set('');
    this.pendingCustomerId.set('');
    this.selectedCustomerLabel.set('');
    this.search.set('');
    this.paymentDate.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.customerId.set('');
    this.page.set(1);
    this.customerSearchImmediate.next('');
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

  formatAppliedTo(appliedTo?: string | null): string | null {
    return getAppliedToLabel(appliedTo);
  }

  getStatusTone(status?: string | null): 'success' | 'warning' | 'neutral' | 'danger' {
    if (!status) return 'neutral';
    const s = status.toLowerCase();
    if (s === 'posted') return 'success';
    if (s === 'draft') return 'warning';
    if (s === 'cancelled' || s === 'reversed') return 'danger';
    return 'neutral';
  }

  // Dialog State
  readonly detailDialogOpen = signal(false);
  readonly detailTarget = signal<PaymentCorrectionTarget | null>(null);

  readonly correctionDialogOpen = signal(false);
  readonly correctionTarget = signal<PaymentCorrectionTarget | null>(null);
  readonly correctionInitialMode = signal<'reverse' | 'correct'>('reverse');
  readonly correctionSubmitting = signal(false);
  readonly correctionError = signal<string | null>(null);

  toCorrectionTarget(item: CustomerPaymentRecord): PaymentCorrectionTarget {
    return {
      id: item.id,
      partyType: 'customer',
      partyName: item.customer?.name ?? null,
      partyPhone: item.customer?.phone ?? null,
      amount: item.amount,
      accountId: item.accountId,
      paymentDate: item.paymentDate,
      allocationMode: item.allocationMode,
      appliedTo: item.appliedTo,
      notes: item.notes,
      reference: null,
      correctionOfId: item.correctionOfId ?? null,
      reason: item.reason ?? null,
      replacementPaymentId: item.replacementPaymentId ?? null,
      allocations: item.allocations,
    };
  }

  isCorrectable(item: CustomerPaymentRecord): boolean {
    return item.status === 'posted' && !item.correctionOfId && !item.replacementPaymentId;
  }

  openDetailDialog(item: CustomerPaymentRecord): void {
    this.detailTarget.set(this.toCorrectionTarget(item));
    this.detailDialogOpen.set(true);
  }

  closeDetailDialog(): void {
    this.detailDialogOpen.set(false);
  }

  openCorrectionDialog(item: CustomerPaymentRecord, mode: 'reverse' | 'correct'): void {
    this.correctionTarget.set(this.toCorrectionTarget(item));
    this.correctionInitialMode.set(mode);
    this.correctionError.set(null);
    this.correctionDialogOpen.set(true);
  }

  closeCorrectionDialog(): void {
    if (this.correctionSubmitting()) return;
    this.correctionDialogOpen.set(false);
    this.correctionError.set(null);
  }

  onDetailReverse(target: PaymentCorrectionTarget): void {
    this.detailDialogOpen.set(false);
    const item = this.items().find((i) => i.id === target.id);
    if (item) {
      this.openCorrectionDialog(item, 'reverse');
    } else {
      this.correctionTarget.set(target);
      this.correctionInitialMode.set('reverse');
      this.correctionError.set(null);
      this.correctionDialogOpen.set(true);
    }
  }

  onDetailCorrect(target: PaymentCorrectionTarget): void {
    this.detailDialogOpen.set(false);
    const item = this.items().find((i) => i.id === target.id);
    if (item) {
      this.openCorrectionDialog(item, 'correct');
    } else {
      this.correctionTarget.set(target);
      this.correctionInitialMode.set('correct');
      this.correctionError.set(null);
      this.correctionDialogOpen.set(true);
    }
  }

  onCorrectionConfirmed(event: PaymentCorrectionDialogResult): void {
    this.correctionSubmitting.set(true);
    this.correctionError.set(null);

    const payload: PaymentCorrectionInput = {
      reason: event.reason,
      replacement: event.replacement
        ? {
            accountId: event.replacement.accountId,
            amount: event.replacement.amount,
            paymentDate: event.replacement.paymentDate,
            allocationMode: event.replacement.allocationMode,
            notes: event.replacement.notes,
          }
        : null,
    };

    this.api
      .correctPayment(event.paymentId, payload, event.idempotencyKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.correctionSubmitting.set(false);
          this.correctionDialogOpen.set(false);
          this.reload(true);
        },
        error: (err: unknown) => {
          this.correctionSubmitting.set(false);
          this.correctionError.set(
            err instanceof HttpErrorResponse
              ? (err.error?.error?.message ?? err.error?.message ?? 'Failed to execute payment correction.')
              : 'Failed to execute payment correction.',
          );
        },
      });
  }
}
