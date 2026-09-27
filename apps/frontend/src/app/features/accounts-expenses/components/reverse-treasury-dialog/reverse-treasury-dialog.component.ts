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
  templateUrl: './reverse-treasury-dialog.component.html',
  styleUrl: './reverse-treasury-dialog.component.scss',
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
