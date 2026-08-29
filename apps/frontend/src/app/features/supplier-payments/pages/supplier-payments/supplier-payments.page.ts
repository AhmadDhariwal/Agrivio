import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import { SupplierPaymentRecord } from '../../models/supplier-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

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
  private readonly dateChanges = new Subject<string>();

  readonly items = signal<SupplierPaymentRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
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
  readonly paymentDate = signal('');

  readonly moduleInfoItems = [
    'General allocation automatically matches outstanding purchase bills oldest-first.',
    'Invoice-specific allocation lets you target specific purchase bills with exact amounts.',
    'Any unallocated remainder is tracked as a supplier advance on the ledger.',
  ];

  constructor() {
    this.dateChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        this.reload();
      });

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
          const params: {
            page: number;
            pageSize: number;
            paymentDate?: string;
            search?: string;
            forceRefresh?: boolean;
          } = {
            page: this.page(),
            pageSize: this.pageSize(),
            forceRefresh: forceRefresh === true,
          };
          if (this.paymentDate()) {
            params.paymentDate = this.paymentDate();
            params.search = this.paymentDate();
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

  onDateChange(value: string): void {
    const formatted = value ? value.trim() : '';
    this.paymentDate.set(formatted);
    this.dateChanges.next(formatted);
  }

  clearFilters(): void {
    this.paymentDate.set('');
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
}
