import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiDialogComponent } from '../../../../shared/ui/ui-dialog/ui-dialog.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { CustomerFinanceApi } from '../../data-access/customer-finance.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import {
  CustomerLoanDetailRecord,
  CustomerLoanRepaymentRecord,
} from '../../models/customers.models';
import { ReverseRepaymentDialogComponent } from '../reverse-repayment-dialog/reverse-repayment-dialog.component';

@Component({
  selector: 'agrivio-loan-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    UiDialogComponent,
    UiStatusBadgeComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    ReverseRepaymentDialogComponent,
  ],
  templateUrl: './loan-detail-dialog.component.html',
  styleUrl: './loan-detail-dialog.component.scss',
})
export class LoanDetailDialogComponent {
  private readonly customerFinanceApi = inject(CustomerFinanceApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly open = input(false);
  readonly loanId = input<string | null>(null);

  readonly dismiss = output<void>();
  readonly refreshNeeded = output<void>();

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly loan = signal<CustomerLoanDetailRecord | null>(null);

  readonly reverseRepaymentDialogOpen = signal(false);
  readonly selectedRepayment = signal<CustomerLoanRepaymentRecord | null>(null);

  readonly canReverseRepayments = () =>
    this.sessionStore.hasPermission('customers.manage') &&
    this.sessionStore.hasPermission('accounts.transaction.post');

  constructor() {
    effect(() => {
      if (this.open() && this.loanId()) {
        this.loadLoan(this.loanId()!);
      }
    });
  }

  loadLoan(id: string): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.customerFinanceApi.getLoan(id, { forceRefresh: true }).subscribe({
      next: (data) => {
        this.loan.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Unable to load loan details.');
        this.loading.set(false);
      },
    });
  }

  humanStatus(status: string): string {
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

  statusTone(status: string): UiBadgeTone {
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

  openReverseRepayment(rep: CustomerLoanRepaymentRecord): void {
    this.selectedRepayment.set(rep);
    this.reverseRepaymentDialogOpen.set(true);
  }

  closeReverseRepayment(): void {
    this.reverseRepaymentDialogOpen.set(false);
    this.selectedRepayment.set(null);
  }

  onRepaymentReversed(): void {
    this.closeReverseRepayment();
    if (this.loanId()) {
      this.loadLoan(this.loanId()!);
    }
    this.refreshNeeded.emit();
  }

  onDismiss(): void {
    this.dismiss.emit();
  }
}
