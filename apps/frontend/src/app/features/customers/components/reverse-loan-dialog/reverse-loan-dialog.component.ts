import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UiDialogComponent } from '../../../../shared/ui/ui-dialog/ui-dialog.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { CustomerFinanceApi } from '../../data-access/customer-finance.api';
import { CustomerLoanRecord, CustomerLoanDetailRecord } from '../../models/customers.models';

@Component({
  selector: 'agrivio-reverse-loan-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiDialogComponent,
    UiFieldLabelComponent,
    UiAlertComponent,
  ],
  template: `
    <agrivio-ui-dialog
      [open]="open()"
      title="Reverse Customer Loan"
      description="Post a compensating reversal for an active loan disbursement."
      size="md"
      (dismiss)="onDismiss()"
    >
      @if (loan(); as targetLoan) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="reverse-loan-form" novalidate>
          @if (errorMessage()) {
            <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
          }

          <div class="warning-callout">
            <h4 class="warning-title">Reversal Impact Confirmation</h4>
            <p class="warning-desc">
              Reversing this loan will permanently cancel the disbursement:
            </p>
            <ul class="impact-list">
              <li><strong>Loan Receivable</strong> will decrease by PKR {{ targetLoan.principal.amount }}</li>
              <li><strong>Disbursement Account</strong> balance will increase by PKR {{ targetLoan.principal.amount }}</li>
            </ul>
          </div>

          <div class="loan-summary-grid">
            <div class="summary-item">
              <span class="summary-label">Loan Reference</span>
              <strong>{{ targetLoan.reference || targetLoan.id }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">Disbursement Date</span>
              <span>{{ targetLoan.businessDate }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Principal Amount</span>
              <strong>PKR {{ targetLoan.principal.amount }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">Current Outstanding</span>
              <strong>PKR {{ targetLoan.outstanding.amount }}</strong>
            </div>
          </div>

          <div class="form-field">
            <agrivio-ui-field-label label="Reversal Reason" [required]="true" for="reverse-loan-reason" />
            <textarea
              id="reverse-loan-reason"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.reason.invalid"
              formControlName="reason"
              placeholder="State the clear audit reason for reversing this customer loan"
              rows="3"
              maxlength="500"
              data-testid="reverse-loan-reason-input"
            ></textarea>
            @if (formSubmitAttempted() && form.controls.reason.errors?.['required']) {
              <p class="field-error" role="alert">Reversal reason is required.</p>
            }
          </div>

          <div dialog-actions class="dialog-actions">
            <button
              type="button"
              class="ag-btn ag-btn--secondary"
              (click)="onDismiss()"
              [disabled]="saving()"
              data-testid="reverse-loan-cancel-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="ag-btn ag-btn--danger"
              [disabled]="saving()"
              data-testid="reverse-loan-confirm-btn"
            >
              {{ saving() ? 'Reversing…' : 'Confirm Loan Reversal' }}
            </button>
          </div>
        </form>
      }
    </agrivio-ui-dialog>
  `,
  styles: [`
    .reverse-loan-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .warning-callout {
      background: var(--color-surface-danger, #fef2f2);
      border: 1px solid var(--color-border-danger, #fecaca);
      border-radius: 6px;
      padding: 0.875rem 1rem;
    }
    .warning-title {
      margin: 0 0 0.375rem;
      font-size: 0.875rem;
      color: var(--color-danger, #991b1b);
    }
    .warning-desc {
      margin: 0 0 0.5rem;
      font-size: 0.8125rem;
      color: var(--color-text-secondary, #475569);
    }
    .impact-list {
      margin: 0;
      padding-left: 1.25rem;
      font-size: 0.8125rem;
      color: var(--color-text-primary, #1e293b);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .loan-summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--color-surface-subtle, #f8fafc);
      border: 1px solid var(--color-border, #cbd5e1);
      border-radius: 6px;
    }
    .summary-item {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .summary-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, #64748b);
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .field-error {
      margin: 0;
      font-size: 0.75rem;
      color: var(--color-danger, #dc2626);
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      width: 100%;
    }
  `],
})
export class ReverseLoanDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly customerFinanceApi = inject(CustomerFinanceApi);

  readonly open = input(false);
  readonly loan = input<CustomerLoanRecord | CustomerLoanDetailRecord | null>(null);

  readonly dismiss = output<void>();
  readonly loanReversed = output<CustomerLoanRecord>();
  readonly closed = output<boolean>();

  readonly form = this.fb.group({
    reason: ['', [Validators.required, Validators.maxLength(500)]],
  });

  readonly saving = signal(false);
  readonly formSubmitAttempted = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.open()) {
        this.form.reset({ reason: '' });
        this.formSubmitAttempted.set(false);
        this.errorMessage.set(null);
        this.saving.set(false);
      }
    });
  }

  onDismiss(): void {
    if (!this.saving()) {
      this.closed.emit(false);
      this.dismiss.emit();
    }
  }

  submit(): void {
    const target = this.loan();
    if (!target) return;

    this.formSubmitAttempted.set(true);
    this.errorMessage.set(null);

    if (this.form.invalid || this.saving()) {
      return;
    }

    const reason = this.form.controls.reason.value!.trim();
    this.saving.set(true);
    const idempotencyKey = crypto.randomUUID();

    this.customerFinanceApi.reverseLoan(target.id, { reason }, idempotencyKey).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.loanReversed.emit(result);
        this.closed.emit(true);
        this.dismiss.emit();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(
          err instanceof HttpErrorResponse
            ? (err.error?.error?.message ?? err.error?.message ?? 'Failed to reverse loan.')
            : 'Failed to reverse loan.',
        );
      },
    });
  }
}
