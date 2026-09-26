import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  SupplierPaymentsApi,
  SupplierPaymentsListQuery,
} from '../../data-access/supplier-payments.api';
import { SupplierPaymentRecord } from '../../models/supplier-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { AppDatePipe } from '../../../../shared/format/date-time.pipe';
import { EMPTY, Subject, catchError, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import {
  PaymentCorrectionDialogComponent,
  PaymentCorrectionDialogResult,
  PaymentCorrectionTarget,
} from '../../../../shared/ui/payment-correction-dialog/payment-correction-dialog.component';
import { PaymentDetailDialogComponent } from '../../../../shared/ui/payment-detail-dialog/payment-detail-dialog.component';
import { SupplierPaymentCorrectionInput } from '../../models/supplier-payments.models';

@Component({
  selector: 'agrivio-supplier-payments-page',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
    AppDatePipe,
    PaymentCorrectionDialogComponent,
    PaymentDetailDialogComponent,
  ],
  templateUrl: './supplier-payments.page.html',
  styleUrl: './supplier-payments.page.scss',
})
export class SupplierPaymentsPage {
  private readonly api = inject(SupplierPaymentsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly reloadRequests = new Subject<boolean>();

  readonly items = signal<SupplierPaymentRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly filterError = signal<string | null>(null);
  readonly canUseSupplierPayments = computed(
    () => this.capabilityService?.canUseModule('payments.supplier') ?? true,
  );
  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('supplier-payments.view') && this.canUseSupplierPayments(),
  );
  readonly canPost = computed(
    () =>
      this.sessionStore.hasPermission('supplier-payments.post') &&
      this.canUseSupplierPayments() &&
      (this.capabilityService?.canPerformAction('payments.supplier.actions.post') ?? true),
  );
  readonly canCorrect = computed(
    () =>
      this.sessionStore.hasPermission('payments.correct') &&
      this.canUseSupplierPayments() &&
      (this.capabilityService?.canPerformAction('payments.supplier.actions.correct') ?? true),
  );
  readonly canViewLedger = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canUseModule('payments.supplierLedger') ?? true) &&
      (this.capabilityService?.canPerformAction('payments.supplier.actions.viewLedger') ?? true),
  );
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseFeature('payments.supplier.features.moduleInfo') ?? true,
  );
  readonly showPaymentDateFilter = computed(
    () =>
      this.capabilityService?.canUseFeature('payments.supplier.features.paymentDateFilter') ?? true,
  );

  canViewField(id: string): boolean {
    return this.capabilityService?.canViewField(`payments.supplier.fields.${id}`) ?? true;
  }
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly search = signal('');
  readonly pendingSearch = signal('');
  readonly showSearch = computed(
    () =>
      (this.capabilityService?.canUseFeature('payments.supplier.features.search') ?? true) &&
      (this.capabilityService?.canUseFeature('payments.supplier.features.paymentDateFilter') ?? true),
  );
  readonly dateMode = signal<'single' | 'range'>('single');
  readonly paymentDate = signal('');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly pendingDateMode = signal<'single' | 'range'>('single');
  readonly pendingPaymentDate = signal('');
  readonly pendingFromDate = signal('');
  readonly pendingToDate = signal('');
  readonly hasActiveFilters = computed(() => {
    if (this.search().trim() !== '') return true;
    return this.dateMode() === 'single'
      ? this.paymentDate() !== ''
      : this.fromDate() !== '' || this.toDate() !== '';
  });
  readonly hasPendingFilters = computed(() => {
    if (this.pendingSearch().trim() !== '') return true;
    return this.pendingDateMode() === 'single'
      ? this.pendingPaymentDate() !== ''
      : this.pendingFromDate() !== '' || this.pendingToDate() !== '';
  });
  readonly invalidPendingDateRange = computed(
    () =>
      this.pendingDateMode() === 'range' &&
      this.pendingFromDate() !== '' &&
      this.pendingToDate() !== '' &&
      this.pendingFromDate() > this.pendingToDate(),
  );

  readonly moduleInfoItems = [
    'General allocation automatically matches outstanding purchase bills oldest-first.',
    'Invoice-specific allocation lets you target specific purchase bills with exact amounts.',
    'Any unallocated remainder is tracked as a supplier advance on the ledger.',
  ];

  constructor() {
    this.reloadRequests
      .pipe(
        startWith(false),
        switchMap((forceRefresh) => {
          if (!this.canView()) {
            this.loading.set(false);
            this.errorMessage.set('You do not have permission to view supplier payments.');
            return EMPTY;
          }
          this.loading.set(true);
          this.errorMessage.set(null);
          const params: SupplierPaymentsListQuery = {
            page: this.page(),
            pageSize: this.pageSize(),
            forceRefresh: forceRefresh === true,
          };
          if (this.search().trim()) params.search = this.search().trim();
          if (this.dateMode() === 'single') {
            if (this.paymentDate()) params.paymentDate = this.paymentDate();
          } else {
            if (this.fromDate()) params.fromDate = this.fromDate();
            if (this.toDate()) params.toDate = this.toDate();
          }
          return this.api.listSupplierPayments(params).pipe(
            catchError((error: unknown) => {
              this.loading.set(false);
              this.errorMessage.set(
                error instanceof HttpErrorResponse
                  ? (error.error?.error?.message ?? 'Unable to load supplier payments.')
                  : 'Unable to load supplier payments.',
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

  formatPaymentId(id: string): string {
    if (!id) return 'SPAY-0000';
    return `SPAY-${id.slice(-4).toUpperCase()}`;
  }

  formatMoney(amount: string): string {
    const parsed = parseFloat(amount ?? '0');
    if (isNaN(parsed)) return '0.00';
    return parsed.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  formatMode(mode?: string | null): string {
    if (!mode) return 'General';
    if (mode === 'invoice_specific') return 'Invoice-specific';
    if (mode === 'general') return 'General';
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  }

  // Dialog State
  readonly detailDialogOpen = signal(false);
  readonly detailTarget = signal<PaymentCorrectionTarget | null>(null);

  readonly correctionDialogOpen = signal(false);
  readonly correctionTarget = signal<PaymentCorrectionTarget | null>(null);
  readonly correctionInitialMode = signal<'reverse' | 'correct'>('reverse');
  readonly correctionSubmitting = signal(false);
  readonly correctionError = signal<string | null>(null);

  toCorrectionTarget(item: SupplierPaymentRecord): PaymentCorrectionTarget {
    return {
      id: item.id,
      partyType: 'supplier',
      partyName: item.supplierId ? `Supplier ${item.supplierId}` : null,
      amount: item.amount,
      accountId: item.accountId,
      paymentDate: item.paymentDate,
      allocationMode: item.allocationMode,
      appliedTo: null,
      notes: item.notes,
      reference: null,
      correctionOfId: item.correctionOfId ?? null,
      reason: item.reason ?? null,
      replacementPaymentId: item.replacementPaymentId ?? null,
      allocations: item.allocations,
    };
  }

  isCorrectable(item: SupplierPaymentRecord): boolean {
    return item.status === 'posted' && !item.correctionOfId && !item.replacementPaymentId;
  }

  openDetailDialog(item: SupplierPaymentRecord): void {
    this.detailTarget.set(this.toCorrectionTarget(item));
    this.detailDialogOpen.set(true);
  }

  closeDetailDialog(): void {
    this.detailDialogOpen.set(false);
  }

  openCorrectionDialog(item: SupplierPaymentRecord, mode: 'reverse' | 'correct'): void {
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

    const payload: SupplierPaymentCorrectionInput = {
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
