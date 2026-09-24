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
  template: `
    <agrivio-ui-dialog
      [open]="open()"
      title="Customer Loan Details"
      description="Inquire loan details, repayment schedule, and settlement history."
      size="lg"
      (dismiss)="onDismiss()"
    >
      @if (loading()) {
        <agrivio-ui-loading-state label="Loading loan details…" />
      } @else if (errorMessage()) {
        <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
      } @else if (loan(); as item) {
        <div class="loan-detail-shell">
          <div class="kpi-strip">
            <div class="kpi-item">
              <span class="kpi-label">Principal</span>
              <strong class="kpi-value">PKR {{ item.principal.amount }}</strong>
            </div>
            <div class="kpi-item">
              <span class="kpi-label">Repaid</span>
              <strong class="kpi-value text-success">PKR {{ item.repaid.amount }}</strong>
            </div>
            <div class="kpi-item">
              <span class="kpi-label">Outstanding</span>
              <strong class="kpi-value text-outstanding" data-testid="loan-detail-outstanding">PKR {{ item.outstanding.amount }}</strong>
            </div>
            <div class="kpi-item">
              <span class="kpi-label">Status</span>
              <agrivio-ui-status-badge [label]="humanStatus(item.status)" [tone]="statusTone(item.status)" />
            </div>
          </div>

          <div class="facts-grid">
            <div class="fact">
              <span class="fact-label">Reference</span>
              <span class="fact-value">{{ item.reference || '—' }}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Disbursement Date</span>
              <span class="fact-value">{{ item.businessDate }}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Due Date</span>
              <span class="fact-value">{{ item.dueDate || '—' }}</span>
            </div>
            <div class="fact">
              <span class="fact-label">Notes</span>
              <span class="fact-value">{{ item.notes || '—' }}</span>
            </div>
          </div>

          <!-- Repayment History Section -->
          <div class="repayments-section">
            <h3 class="section-title">Repayment History</h3>
            @if (item.repayments && item.repayments.length > 0) {
              <div class="table-wrap">
                <table class="ag-table" data-testid="loan-repayments-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Reference</th>
                      <th scope="col">Notes</th>
                      @if (canReverseRepayments()) {
                        <th scope="col" class="ag-table__col--actions">Actions</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (rep of item.repayments; track rep.id) {
                      <tr>
                        <td>{{ rep.businessDate }}</td>
                        <td class="tabular-num font-semibold">PKR {{ rep.amount.amount }}</td>
                        <td>
                          <agrivio-ui-status-badge
                            [label]="rep.status === 'posted' ? 'Posted' : 'Reversed'"
                            [tone]="rep.status === 'posted' ? 'success' : 'danger'"
                          />
                        </td>
                        <td>{{ rep.reference || '—' }}</td>
                        <td>{{ rep.notes || '—' }}</td>
                        @if (canReverseRepayments()) {
                          <td class="ag-table__col--actions">
                            @if (rep.status === 'posted') {
                              <button
                                type="button"
                                class="ag-btn ag-btn--ghost ag-btn--sm text-danger"
                                (click)="openReverseRepayment(rep)"
                                data-testid="reverse-repayment-btn"
                              >
                                Reverse
                              </button>
                            } @else {
                              <span class="ag-muted">—</span>
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="ag-muted" data-testid="no-repayments-msg">No repayments recorded yet.</p>
            }
          </div>
        </div>
      }

      <div dialog-actions class="dialog-actions">
        <button
          type="button"
          class="ag-btn ag-btn--secondary"
          (click)="onDismiss()"
          data-testid="loan-detail-close-btn"
        >
          Close
        </button>
      </div>
    </agrivio-ui-dialog>

    <!-- Reverse Repayment Dialog -->
    <agrivio-reverse-repayment-dialog
      [open]="reverseRepaymentDialogOpen()"
      [repayment]="selectedRepayment()"
      (dismiss)="closeReverseRepayment()"
      (repaymentReversed)="onRepaymentReversed()"
    />
  `,
  styles: [`
    .loan-detail-shell {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      background: var(--color-surface-subtle, #f8fafc);
      border: 1px solid var(--color-border, #cbd5e1);
      border-radius: 6px;
    }
    .kpi-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .kpi-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .kpi-value {
      font-size: 1.125rem;
    }
    .text-success {
      color: #166534;
    }
    .text-outstanding {
      color: var(--color-primary-dark, #0f766e);
    }
    .text-danger {
      color: #b91c1c;
    }
    .facts-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem 1.5rem;
      font-size: 0.875rem;
    }
    .fact {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .fact-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, #64748b);
    }
    .fact-value {
      color: var(--color-text-primary, #0f172a);
    }
    .repayments-section {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }
    .section-title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
    }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: 6px;
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      width: 100%;
    }
    @media (max-width: 640px) {
      .kpi-strip {
        grid-template-columns: repeat(2, 1fr);
      }
      .facts-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
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
