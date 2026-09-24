import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, catchError, debounceTime, merge, of, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CustomerFinanceApi } from '../../data-access/customer-finance.api';
import { CustomersApi } from '../../data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import {
  CustomerLoanRecord,
  CustomerLoanStatus,
  CustomerRecord,
} from '../../models/customers.models';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { GiveCustomerLoanDialogComponent } from '../../components/give-loan-dialog/give-loan-dialog.component';
import { RepayLoanDialogComponent } from '../../components/repay-loan-dialog/repay-loan-dialog.component';
import { ReverseLoanDialogComponent } from '../../components/reverse-loan-dialog/reverse-loan-dialog.component';
import { LoanDetailDialogComponent } from '../../components/loan-detail-dialog/loan-detail-dialog.component';

@Component({
  selector: 'agrivio-customer-loans-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
    UiStatusBadgeComponent,
    GiveCustomerLoanDialogComponent,
    RepayLoanDialogComponent,
    ReverseLoanDialogComponent,
    LoanDetailDialogComponent,
  ],
  templateUrl: './customer-loans.page.html',
  styleUrl: './customer-loans.page.scss',
})
export class CustomerLoansPage {
  private readonly customerFinanceApi = inject(CustomerFinanceApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly loans = signal<CustomerLoanRecord[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly search = signal('');
  readonly statusFilter = signal<string>('all');
  readonly fromDate = signal('');
  readonly toDate = signal('');

  private readonly knownCustomers = new Map<string, string>();
  private readonly reloadRequests = new Subject<boolean>();

  // Dialog states
  readonly giveLoanOpen = signal(false);
  readonly repayLoanOpen = signal(false);
  readonly reverseLoanOpen = signal(false);
  readonly detailLoanOpen = signal(false);
  readonly selectedLoan = signal<CustomerLoanRecord | null>(null);

  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('customers.view') &&
      (this.capabilityService?.canUseModule('customers') ?? true),
  );

  readonly canDisburseLoan = computed(
    () =>
      this.sessionStore.hasPermission('customers.manage') &&
      this.sessionStore.hasPermission('accounts.transaction.post') &&
      (this.capabilityService?.canUseModule('customers') ?? true),
  );

  readonly isFiltered = computed(
    () =>
      Boolean(this.search().trim()) ||
      this.statusFilter() !== 'all' ||
      Boolean(this.fromDate()) ||
      Boolean(this.toDate()),
  );

  constructor() {
    this.customersApi.searchCustomerOptions('').subscribe({
      next: (items: CustomerRecord[]) => {
        for (const item of items) {
          this.knownCustomers.set(item.id, item.name);
        }
      },
    });

    const search$ = new Subject<void>();

    merge(this.reloadRequests, search$)
      .pipe(
        debounceTime(50),
        switchMap(() => {
          this.loading.set(true);
          this.errorMessage.set(null);
          return this.customerFinanceApi
            .listLoans({
              page: this.page(),
              pageSize: this.pageSize(),
              search: this.search().trim() || undefined,
              status: this.statusFilter() !== 'all' ? this.statusFilter() : undefined,
              fromDate: this.fromDate() || undefined,
              toDate: this.toDate() || undefined,
              forceRefresh: true,
            })
            .pipe(
              catchError((err: unknown) => {
                this.errorMessage.set('Failed to load customer loans.');
                return of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } });
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.loans.set(res.items);
        this.total.set(res.meta.total);
        this.loading.set(false);
      });

    this.reloadRequests.next(true);
  }

  onSearch(val: string): void {
    this.search.set(val);
    this.page.set(1);
    this.reloadRequests.next(true);
  }

  onStatusChange(val: string): void {
    this.statusFilter.set(val);
    this.page.set(1);
    this.reloadRequests.next(true);
  }

  onFromDateChange(val: string): void {
    this.fromDate.set(val);
    this.page.set(1);
    this.reloadRequests.next(true);
  }

  onToDateChange(val: string): void {
    this.toDate.set(val);
    this.page.set(1);
    this.reloadRequests.next(true);
  }

  onPageChange(newPage: number): void {
    this.page.set(newPage);
    this.reloadRequests.next(true);
  }

  reload(): void {
    this.reloadRequests.next(true);
  }

  customerName(customerId: string): string {
    return this.knownCustomers.get(customerId) || `Customer #${customerId.slice(-6)}`;
  }

  humanStatus(status: CustomerLoanStatus | string): string {
    switch (status) {
      case 'open':
        return 'Open';
      case 'partially_repaid':
        return 'Partially Repaid';
      case 'repaid':
        return 'Repaid';
      case 'reversed':
        return 'Reversed';
      default:
        return status;
    }
  }

  statusTone(status: CustomerLoanStatus | string): UiBadgeTone {
    switch (status) {
      case 'open':
        return 'primary';
      case 'partially_repaid':
        return 'warning';
      case 'repaid':
        return 'success';
      case 'reversed':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  canRepay(loan: CustomerLoanRecord): boolean {
    return (
      (loan.status === 'open' || loan.status === 'partially_repaid') &&
      this.canDisburseLoan()
    );
  }

  canReverse(loan: CustomerLoanRecord): boolean {
    return (
      loan.status === 'open' &&
      loan.repaid.amount === '0.00' &&
      this.canDisburseLoan()
    );
  }

  openGiveLoan(): void {
    this.giveLoanOpen.set(true);
  }

  closeGiveLoan(): void {
    this.giveLoanOpen.set(false);
  }

  onLoanCreated(): void {
    this.closeGiveLoan();
    this.reload();
  }

  openRepay(loan: CustomerLoanRecord): void {
    this.selectedLoan.set(loan);
    this.repayLoanOpen.set(true);
  }

  closeRepay(): void {
    this.repayLoanOpen.set(false);
    this.selectedLoan.set(null);
  }

  onRepaymentRecorded(): void {
    this.closeRepay();
    this.reload();
  }

  openReverse(loan: CustomerLoanRecord): void {
    this.selectedLoan.set(loan);
    this.reverseLoanOpen.set(true);
  }

  closeReverse(): void {
    this.reverseLoanOpen.set(false);
    this.selectedLoan.set(null);
  }

  onLoanReversed(): void {
    this.closeReverse();
    this.reload();
  }

  openDetails(loan: CustomerLoanRecord): void {
    this.selectedLoan.set(loan);
    this.detailLoanOpen.set(true);
  }

  closeDetails(): void {
    this.detailLoanOpen.set(false);
    this.selectedLoan.set(null);
  }
}
