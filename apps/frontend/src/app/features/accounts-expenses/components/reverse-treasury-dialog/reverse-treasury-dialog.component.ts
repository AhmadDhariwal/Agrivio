import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UiDialogComponent } from '../../../../shared/ui/ui-dialog/ui-dialog.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { AccountMovementRecord, AccountRecord } from '../../models/accounts.models';
import { AccountsApi } from '../../data-access/accounts.api';

@Component({
  selector: 'agrivio-reverse-treasury-dialog',
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
      [title]="dialogTitle()"
      description="Post an offsetting corrective movement. The original posted movement remains immutable."
      size="md"
      (dismiss)="onDismiss()"
    >
      @if (movement(); as m) {
        <form [formGroup]="form" (ngSubmit)="submit()" class="reversal-form" novalidate>
          @if (errorMessage()) {
            <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
          }

          <!-- Details Card -->
          <div class="reversal-details-card" data-testid="reversal-details-card">
            <div class="detail-row">
              <span class="detail-row__label">Transaction</span>
              <span class="detail-row__val">{{ transactionTypeLabel(m.sourceType) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">Amount</span>
              <span class="detail-row__val font-bold">PKR {{ formatAmount(m.signedAmount.amount) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-row__label">Account(s)</span>
              <span class="detail-row__val">{{ getAccountDisplay(m) }}</span>
            </div>
            @if (m.reference) {
              <div class="detail-row">
                <span class="detail-row__label">Reference</span>
                <span class="detail-row__val">{{ m.reference }}</span>
              </div>
            }
          </div>

          <div class="reversal-warning-callout">
            <p class="warning-text">
              Reversing this operation will create an offsetting record with opposite sign. Posted transactions are never deleted or rewritten.
            </p>
          </div>

          <!-- Reason Input -->
          <div class="form-field">
            <agrivio-ui-field-label label="Reason for Reversal" [required]="true" for="reversal-reason" />
            <input
              id="reversal-reason"
              type="text"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.reason.invalid"
              formControlName="reason"
              placeholder="e.g. Entered incorrect amount or duplicate posting"
              data-testid="reversal-reason-input"
              maxlength="500"
            />
            @if (formSubmitAttempted() && form.controls.reason.errors?.['required']) {
              <p class="field-error" role="alert">Reason is required for reversal.</p>
            }
          </div>

          <div dialog-actions class="dialog-actions">
            <button
              type="button"
              class="ag-btn ag-btn--secondary"
              (click)="onDismiss()"
              [disabled]="submitting()"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="ag-btn ag-btn--danger"
              [disabled]="submitting() || form.invalid"
              data-testid="confirm-reversal-btn"
            >
              @if (submitting()) {
                <span>Reversing…</span>
              } @else {
                <span>Confirm Reversal</span>
              }
            </button>
          </div>
        </form>
      }
    </agrivio-ui-dialog>
  `,
  styles: [`
    .reversal-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .reversal-details-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }
    .detail-row__label {
      color: #64748b;
    }
    .detail-row__val {
      color: #0f172a;
      font-weight: 500;
    }
    .font-bold {
      font-weight: 700;
    }
    .reversal-warning-callout {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .warning-text {
      margin: 0;
      font-size: 12.5px;
      color: #b45309;
      line-height: 1.45;
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ag-input {
      height: 38px;
      padding: 0 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13.5px;
      color: #0f172a;
      background: #ffffff;
      outline: none;
      font-family: inherit;
      box-sizing: border-box;
      width: 100%;
    }
    .ag-input:focus {
      border-color: #dc2626;
      box-shadow: 0 0 0 1px #dc2626;
    }
    .ag-input--invalid {
      border-color: #dc2626 !important;
    }
    .field-error {
      font-size: 12px;
      color: #dc2626;
      margin: 2px 0 0 0;
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .ag-btn--danger {
      background: #dc2626;
      color: #ffffff;
      border-color: #dc2626;
    }
    .ag-btn--danger:hover:not(:disabled) {
      background: #b91c1c;
      border-color: #b91c1c;
    }
  `],
})
export class ReverseTreasuryDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AccountsApi);

  readonly open = input(false);
  readonly movement = input<AccountMovementRecord | null>(null);
  readonly accounts = input<AccountRecord[]>([]);

  readonly dismiss = output<void>();
  readonly reversed = output<void>();

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);

  readonly form = this.fb.nonNullable.group({
    reason: ['', [Validators.required]],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.errorMessage.set(null);
        this.formSubmitAttempted.set(false);
        this.form.reset({ reason: '' });
      }
    });
  }

  dialogTitle(): string {
    const m = this.movement();
    if (!m) return 'Reverse Transaction';
    if (m.sourceType.startsWith('account_transfer')) {
      return 'Reverse Account Transfer';
    }
    if (m.sourceType.startsWith('balance_adjustment')) {
      return 'Reverse Balance Adjustment';
    }
    return 'Reverse Transaction';
  }

  isTransfer(m: AccountMovementRecord): boolean {
    return m.sourceType === 'account_transfer_out' || m.sourceType === 'account_transfer_in';
  }

  getAccountDisplay(m: AccountMovementRecord): string {
    const acc = this.accounts().find((a) => a.id === m.accountId);
    const accName = acc?.name ?? 'Account';
    if (this.isTransfer(m)) {
      return `Transfer leg on ${accName}`;
    }
    return accName;
  }

  transactionTypeLabel(sourceType: string): string {
    switch (sourceType) {
      case 'account_transfer_out':
      case 'account_transfer_in':
        return 'Internal Transfer';
      case 'manual_inflow':
        return 'External Money Added';
      case 'manual_outflow':
        return 'External Money Withdrawn';
      case 'balance_adjustment_increase':
      case 'balance_adjustment_decrease':
        return 'Balance Adjustment';
      case 'account_transfer_reversal':
        return 'Transfer Reversal';
      case 'manual_inflow_reversal':
      case 'manual_outflow_reversal':
        return 'Adjustment Reversal';
      default:
        return sourceType;
    }
  }

  formatAmount(val: string): string {
    const n = Math.abs(Number(val));
    if (isNaN(n)) return val;
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onDismiss(): void {
    if (!this.submitting()) {
      this.dismiss.emit();
    }
  }

  submit(): void {
    this.formSubmitAttempted.set(true);
    const m = this.movement();
    if (!m || this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    const reason = this.form.getRawValue().reason.trim();
    const idempotencyKey = crypto.randomUUID();

    if (this.isTransfer(m)) {
      // Transfer reversal calls reverseTransfer with sourceId (transfer ID)
      this.api.reverseTransfer(m.sourceId, { reason }, idempotencyKey).subscribe({
        next: () => {
          this.submitting.set(false);
          this.reversed.emit();
          this.dismiss.emit();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(
            err instanceof HttpErrorResponse
              ? (err.error?.error?.message ?? 'Unable to reverse transfer.')
              : 'Unable to reverse transfer.',
          );
        },
      });
      return;
    }

    // Manual inflow/outflow and balance adjustments call reverseManualTransaction with movement ID
    this.api.reverseManualTransaction(m.id, { reason }, idempotencyKey).subscribe({
      next: () => {
        this.submitting.set(false);
        this.reversed.emit();
        this.dismiss.emit();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(
          err instanceof HttpErrorResponse
            ? (err.error?.error?.message ?? 'Unable to reverse transaction.')
            : 'Unable to reverse transaction.',
        );
      },
    });
  }
}
