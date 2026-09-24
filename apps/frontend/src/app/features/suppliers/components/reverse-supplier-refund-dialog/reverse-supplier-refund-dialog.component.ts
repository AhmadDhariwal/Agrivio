import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UiDialogComponent } from '../../../../shared/ui/ui-dialog/ui-dialog.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { SupplierFinanceApi } from '../../data-access/supplier-finance.api';
import { SupplierRefundRecord } from '../../models/suppliers.models';

@Component({
  selector: 'agrivio-reverse-supplier-refund-dialog',
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
      title="Reverse Supplier Refund"
      description="Post a compensating reversal for a previously recorded supplier refund."
      size="md"
      (dismiss)="onDismiss()"
    >
      @if (refund(); as targetRefund) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="reverse-refund-form" novalidate>
          @if (errorMessage()) {
            <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
          }

          <div class="warning-callout" data-testid="refund-reversal-callout">
            <h4 class="warning-title">Reversal Impact Confirmation</h4>
            <p class="warning-desc">
              Reversing this refund will restore the supplier advance balance and deduct funds from the account:
            </p>
            <ul class="impact-list">
              <li>
                <strong>Supplier Advance:</strong> will increase by
                <span class="text-pos" data-testid="reversal-advance-impact">+ PKR {{ targetRefund.amount.amount }}</span>
              </li>
              <li>
                <strong>{{ accountName() || 'Account' }}:</strong> will decrease by
                <span class="text-neg" data-testid="reversal-account-impact">- PKR {{ targetRefund.amount.amount }}</span>
              </li>
            </ul>
          </div>

          <div class="refund-summary-grid">
            <div class="summary-item">
              <span class="summary-label">Refund Reference</span>
              <strong>{{ targetRefund.reference || targetRefund.id }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">Business Date</span>
              <span>{{ targetRefund.businessDate }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Refund Amount</span>
              <strong data-testid="reversal-amount-display">PKR {{ targetRefund.amount.amount }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-label">Status</span>
              <span>{{ targetRefund.status }}</span>
            </div>
          </div>

          <div class="form-field">
            <agrivio-ui-field-label label="Reversal Reason" [required]="true" for="reverse-refund-reason" />
            <textarea
              id="reverse-refund-reason"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.reason.invalid"
              formControlName="reason"
              placeholder="State the clear audit reason for reversing this supplier refund"
              rows="3"
              maxlength="500"
              data-testid="reverse-refund-reason-input"
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
              data-testid="reverse-refund-cancel-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="ag-btn ag-btn--danger"
              [disabled]="saving()"
              data-testid="reverse-refund-confirm-btn"
            >
              {{ saving() ? 'Reversing…' : 'Reverse Refund' }}
            </button>
          </div>
        </form>
      }
    </agrivio-ui-dialog>
  `,
  styles: [`
    .reverse-refund-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .warning-callout {
      background: var(--color-surface-warning-subtle, #fffbeb);
      border: 1px solid var(--color-border-warning, #fde68a);
      border-radius: 6px;
      padding: 0.875rem;
    }
    .warning-title {
      margin: 0 0 0.375rem;
      font-size: 0.875rem;
      color: var(--color-warning-dark, #b45309);
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
      color: var(--color-text-primary, #0f172a);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .refund-summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--color-surface-subtle, #f8fafc);
      border: 1px solid var(--color-border-subtle, #e2e8f0);
      border-radius: 6px;
    }
    .summary-item {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      font-size: 0.875rem;
    }
    .summary-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, #64748b);
    }
    .text-pos {
      color: #166534;
      font-weight: 600;
    }
    .text-neg {
      color: #991b1b;
      font-weight: 600;
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
export class ReverseSupplierRefundDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supplierFinanceApi = inject(SupplierFinanceApi);

  readonly open = input(false);
  readonly refund = input<SupplierRefundRecord | null>(null);
  readonly accountName = input<string | null>(null);

  readonly dismiss = output<void>();
  readonly refundReversed = output<SupplierRefundRecord>();
  readonly closed = output<boolean>();

  readonly saving = signal(false);
  readonly formSubmitAttempted = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group({
    reason: ['', [Validators.required, Validators.maxLength(500)]],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.reset();
      }
    });
  }

  private reset(): void {
    this.form.reset({ reason: '' });
    this.formSubmitAttempted.set(false);
    this.errorMessage.set(null);
    this.saving.set(false);
  }

  onDismiss(): void {
    if (!this.saving()) {
      this.closed.emit(false);
      this.dismiss.emit();
    }
  }

  submit(): void {
    const target = this.refund();
    if (!target) return;

    this.formSubmitAttempted.set(true);
    this.errorMessage.set(null);

    if (this.form.invalid || this.saving()) {
      return;
    }

    const reason = this.form.controls.reason.value!.trim();
    this.saving.set(true);
    const idempotencyKey = crypto.randomUUID();

    this.supplierFinanceApi
      .reverseRefund(target.id, { reason }, idempotencyKey)
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.refundReversed.emit(updated);
          this.dismiss.emit();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (err instanceof HttpErrorResponse) {
            this.errorMessage.set(
              err.error?.error?.message ?? err.error?.message ?? 'Failed to reverse supplier refund.',
            );
          } else {
            this.errorMessage.set('Failed to reverse supplier refund.');
          }
        },
      });
  }
}
