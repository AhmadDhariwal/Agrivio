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
  templateUrl: './reverse-supplier-refund-dialog.component.html',
  styleUrl: './reverse-supplier-refund-dialog.component.scss',
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
