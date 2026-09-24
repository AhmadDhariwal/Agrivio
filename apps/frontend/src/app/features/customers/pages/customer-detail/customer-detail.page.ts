import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CustomersApi } from '../../data-access/customers.api';
import { CustomerFinanceApi } from '../../data-access/customer-finance.api';
import { CustomerPaymentsApi } from '../../../customer-payments/data-access/customer-payments.api';
import { CustomerRecord, CustomerLoanRecord, CustomerLoanStatus } from '../../models/customers.models';
import {
  CustomerLedgerEffectRecord,
  humanizeLedgerItem,
  HumanizedCustomerLedgerItem,
} from '../../../customer-payments/models/ledger-presentation.util';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { GiveLoanDialogComponent } from '../../components/give-loan-dialog/give-loan-dialog.component';
import { RepayLoanDialogComponent } from '../../components/repay-loan-dialog/repay-loan-dialog.component';
import { ReverseLoanDialogComponent } from '../../components/reverse-loan-dialog/reverse-loan-dialog.component';
import { LoanDetailDialogComponent } from '../../components/loan-detail-dialog/loan-detail-dialog.component';
import { AdjustCustomerBalanceDialogComponent } from '../../components/adjust-customer-balance-dialog/adjust-customer-balance-dialog.component';

@Component({
  selector: 'agrivio-customer-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    GiveLoanDialogComponent,
    RepayLoanDialogComponent,
    ReverseLoanDialogComponent,
    LoanDetailDialogComponent,
    AdjustCustomerBalanceDialogComponent,
  ],
  templateUrl: './customer-detail.page.html',
  styleUrl: './customer-detail.page.scss',
})
export class CustomerDetailPage {
  private readonly api = inject(CustomersApi);
  private readonly financeApi = inject(CustomerFinanceApi, { optional: true });
  private readonly paymentsApi = inject(CustomerPaymentsApi, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly customer = signal<CustomerRecord | null>(null);

  // Customer Loans
  readonly loans = signal<CustomerLoanRecord[]>([]);
  readonly loadingLoans = signal(false);

  // Customer Ledger
  readonly ledgerItems = signal<CustomerLedgerEffectRecord[]>([]);
  readonly loadingLedger = signal(false);
  readonly humanizedLedgerItems = computed<HumanizedCustomerLedgerItem[]>(() =>
    this.ledgerItems().map(humanizeLedgerItem),
  );

  // Dialog visibility and selection states
  readonly giveLoanOpen = signal(false);
  readonly repayLoanOpen = signal(false);
  readonly reverseLoanOpen = signal(false);
  readonly loanDetailOpen = signal(false);
  readonly adjustBalanceOpen = signal(false);
  readonly selectedLoan = signal<CustomerLoanRecord | null>(null);
  readonly selectedLoanId = signal<string | null>(null);

  readonly preselectedCustomer = computed<{ id: string; name: string } | null>(() => {
    const cust = this.customer();
    return cust ? { id: cust.id, name: cust.name } : null;
  });

  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('customers.view') &&
      (this.capabilityService?.canUseModule('customers') ?? true) &&
      (this.capabilityService?.canPerformAction('customers.actions.inspect') ?? true),
  );

  readonly canEdit = computed(
    () =>
      this.sessionStore.hasPermission('customers.manage') &&
      (this.capabilityService?.canUseModule('customers') ?? true) &&
      (this.capabilityService?.canPerformAction('customers.actions.edit') ?? true),
  );

  readonly canReceivePayment = computed(
    () => this.sessionStore.hasPermission('customer-payments.post'),
  );

  readonly canManageLoans = computed(
    () =>
      this.sessionStore.hasPermission('customers.manage') &&
      this.sessionStore.hasPermission('accounts.transaction.post'),
  );

  readonly canAdjustBalance = computed(
    () => this.sessionStore.hasPermission('customers.manage'),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }
    this.loadCustomer(id);
    this.loadCustomerLoans(id);
    this.loadCustomerLedger(id);
  }

  loadCustomer(id: string): void {
    this.api.getCustomer(id).subscribe({
      next: (customer) => {
        this.customer.set(customer);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error));
        this.loading.set(false);
      },
    });
  }

  loadCustomerLoans(id: string): void {
    if (!this.sessionStore.hasPermission('customers.view') || !this.financeApi || typeof (this.sessionStore as any).activeContext !== 'function') return;
    this.loadingLoans.set(true);
    this.financeApi.listLoans({ customerId: id, pageSize: 50 }).subscribe({
      next: (res) => {
        this.loans.set(res.items);
        this.loadingLoans.set(false);
      },
      error: () => {
        this.loadingLoans.set(false);
      },
    });
  }

  loadCustomerLedger(id: string): void {
    if (!this.sessionStore.hasPermission('customers.view') || !this.paymentsApi || typeof (this.sessionStore as any).activeContext !== 'function') return;
    this.loadingLedger.set(true);
    this.paymentsApi.listCustomerLedger(id).subscribe({
      next: (items) => {
        this.ledgerItems.set(items);
        this.loadingLedger.set(false);
      },
      error: () => {
        this.loadingLedger.set(false);
      },
    });
  }

  statusTone(status: string): UiBadgeTone {
    return status === 'active' ? 'success' : 'neutral';
  }

  formatMoney(amount: string | undefined, currency = 'PKR'): string {
    if (!amount) return '—';
    const n = Number(amount);
    return Number.isFinite(n)
      ? `${currency} ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${currency} ${amount}`;
  }

  formatLabel(value: string | undefined | null): string {
    if (!value) return '—';
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  canViewField(field: string): boolean {
    return this.capabilityService?.canViewField(`customers.fields.${field}`) ?? true;
  }

  canViewCreditSection(): boolean {
    return this.capabilityService?.canUseView('customers.features.creditSection') ?? true;
  }

  canReverseLoan(loan: CustomerLoanRecord): boolean {
    if (!this.canManageLoans()) return false;
    if (loan.status === 'reversed') return false;
    const repaid = Number(loan.repaid?.amount ?? loan.totalRepaid?.amount ?? '0');
    return repaid === 0;
  }

  formatLoanStatus(status: CustomerLoanStatus): string {
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

  loanStatusTone(status: CustomerLoanStatus): UiBadgeTone {
    switch (status) {
      case 'open':
        return 'primary';
      case 'partially_repaid':
        return 'warning';
      case 'repaid':
        return 'success';
      case 'reversed':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  // Action methods
  openGiveLoan(): void {
    this.giveLoanOpen.set(true);
  }

  onGiveLoanClosed(success: boolean): void {
    this.giveLoanOpen.set(false);
    if (success) {
      const c = this.customer();
      if (c) {
        this.loadCustomer(c.id);
        this.loadCustomerLoans(c.id);
        this.loadCustomerLedger(c.id);
      }
    }
  }

  openRepayLoan(loan?: CustomerLoanRecord): void {
    this.selectedLoan.set(loan ?? null);
    this.repayLoanOpen.set(true);
  }

  onRepayLoanClosed(success: boolean): void {
    this.repayLoanOpen.set(false);
    this.selectedLoan.set(null);
    if (success) {
      const c = this.customer();
      if (c) {
        this.loadCustomer(c.id);
        this.loadCustomerLoans(c.id);
        this.loadCustomerLedger(c.id);
      }
    }
  }

  openReverseLoan(loan: CustomerLoanRecord): void {
    this.selectedLoan.set(loan);
    this.reverseLoanOpen.set(true);
  }

  onReverseLoanClosed(success: boolean): void {
    this.reverseLoanOpen.set(false);
    this.selectedLoan.set(null);
    if (success) {
      const c = this.customer();
      if (c) {
        this.loadCustomer(c.id);
        this.loadCustomerLoans(c.id);
        this.loadCustomerLedger(c.id);
      }
    }
  }

  openLoanDetail(loanId: string): void {
    this.selectedLoanId.set(loanId);
    this.loanDetailOpen.set(true);
  }

  onLoanDetailClosed(): void {
    this.loanDetailOpen.set(false);
    this.selectedLoanId.set(null);
    const c = this.customer();
    if (c) {
      this.loadCustomer(c.id);
      this.loadCustomerLoans(c.id);
      this.loadCustomerLedger(c.id);
    }
  }


  openAdjustBalance(): void {
    this.adjustBalanceOpen.set(true);
  }

  onAdjustBalanceClosed(success: boolean): void {
    this.adjustBalanceOpen.set(false);
    if (success) {
      const c = this.customer();
      if (c) {
        this.loadCustomer(c.id);
        this.loadCustomerLoans(c.id);
        this.loadCustomerLedger(c.id);
      }
    }
  }

  private mapError(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? (error.error?.error?.message ?? 'Unable to load customer details.')
      : 'Unable to load customer details.';
  }
}
