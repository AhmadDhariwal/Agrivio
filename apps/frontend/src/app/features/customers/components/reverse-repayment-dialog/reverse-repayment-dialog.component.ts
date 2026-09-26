import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UiDialogComponent } from '../../../../shared/ui/ui-dialog/ui-dialog.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { CustomerFinanceApi } from '../../data-access/customer-finance.api';
import { CustomerLoanRepaymentRecord } from '../../models/customers.models';

@Component({
  selector: 'agrivio-reverse-repayment-dialog',
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
      title="Reverse Loan Repayment"
      description="Post a compensating reversal for an existing customer loan repayment."
      size="md"
      (dismiss)="onDismiss()"
    >
      @if (repayment(); as rep) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="reverse-repayment-form" novalidate>
          @if (errorMessage()) {
            <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
          }

          <div class="warning-callout">
            <h4 class="warning-title">Reversal Impact Confirmation</h4>
            <p class="warning-desc">
              Reversing this repayment will post compensating accounting movements:
            </p>
            <ul class="impact-list">
              <li><strong>Loan Receivable</strong> will increase by PKR {{ rep.amount.amount }}</li>
              <li><strong>Receiving Account</strong> balance will decrease by PKR {{ rep.amount.amount }}</li>
            </ul>
          </div>

          <div class="repay-summary-grid">
            <div class="summary-item">
              <span class="summary-label">Repayment ID</span>
              <strong>{{ rep.id }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">Payment Date</span>
              <span>{{ rep.businessDate }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Amount</span>
              <strong>PKR {{ rep.amount.amount }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">Reference</span>
              <span>{{ rep.reference || '—' }}</span>
            </div>
          </div>

          <div class="form-field">
            <agrivio-ui-field-label label="Reversal Reason" [required]="true" for="reverse-rep-reason" />
            <textarea
              id="reverse-rep-reason"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.reason.invalid"
              formControlName="reason"
              placeholder="State the audit reason for reversing this repayment"
              rows="3"
              maxlength="500"
              data-testid="reverse-repayment-reason-input"
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
              data-testid="reverse-repayment-cancel-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="ag-btn ag-btn--danger"
              [disabled]="saving()"
              data-testid="reverse-repayment-confirm-btn"
            >
              {{ saving() ? 'Reversing…' : 'Confirm Repayment Reversal' }}
            </button>
          </div>
        </form>
      }
    </agrivio-ui-dialog>
  `,
  styles: [`
    .reverse-repayment-form {
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
    .repay-summary-grid {
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
export class ReverseRepaymentDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly customerFinanceApi = inject(CustomerFinanceApi);

  readonly open = input(false);
  readonly repayment = input<CustomerLoanRepaymentRecord | null>(null);

  readonly dismiss = output<void>();
  readonly repaymentReversed = output<any>();

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
      this.dismiss.emit();
    }
  }

  submit(): void {
    const target = this.repayment();
    if (!target) return;

    this.formSubmitAttempted.set(true);
    this.errorMessage.set(null);

    if (this.form.invalid || this.saving()) {
      return;
    }

    const reason = this.form.controls.reason.value!.trim();
    this.saving.set(true);
    const idempotencyKey = crypto.randomUUID();

    this.customerFinanceApi.reverseRepayment(target.id, { reason }, idempotencyKey).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.repaymentReversed.emit(result);
        this.dismiss.emit();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(
          err instanceof HttpErrorResponse
            ? (err.error?.error?.message ?? err.error?.message ?? 'Failed to reverse repayment.')
            : 'Failed to reverse repayment.',
        );
      },
    });
  }
}
