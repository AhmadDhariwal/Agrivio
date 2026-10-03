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
  templateUrl: './reverse-repayment-dialog.component.html',
  styleUrl: './reverse-repayment-dialog.component.scss',
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
