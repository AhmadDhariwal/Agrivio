import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UiDialogComponent } from '../../../../shared/ui/ui-dialog/ui-dialog.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { SupplierFinanceApi } from '../../data-access/supplier-finance.api';
import {
  SupplierBalanceAdjustmentRecord,
  SupplierBalanceType,
  SupplierRecord,
} from '../../models/suppliers.models';

function nonNegativeMoneyValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value;
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (isNaN(num) || num < 0) {
    return { invalidMoney: true };
  }
  return null;
}

export const SUPPLIER_ADJUSTMENT_CATEGORIES = [
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'correction', label: 'Balance Correction' },
  { value: 'opening_correction', label: 'Opening Correction' },
  { value: 'other', label: 'Other' },
] as const;

@Component({
  selector: 'agrivio-adjust-supplier-balance-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiDialogComponent,
    UiFieldLabelComponent,
    UiAlertComponent,
  ],
  templateUrl: './adjust-supplier-balance-dialog.component.html',
  styleUrl: './adjust-supplier-balance-dialog.component.scss',
})
export class AdjustSupplierBalanceDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supplierFinanceApi = inject(SupplierFinanceApi);

  readonly open = input(false);
  readonly supplier = input<SupplierRecord | null>(null);

  readonly dismiss = output<void>();
  readonly balanceAdjusted = output<SupplierBalanceAdjustmentRecord>();
  readonly closed = output<boolean>();

  readonly categoryOptions = SUPPLIER_ADJUSTMENT_CATEGORIES;

  readonly form = this.fb.group({
    balanceType: ['supplier_payable' as SupplierBalanceType, Validators.required],
    desiredBalance: ['', [Validators.required, nonNegativeMoneyValidator]],
    category: ['reconciliation', Validators.required],
    businessDate: [new Date().toISOString().slice(0, 10), Validators.required],
    reason: ['', [Validators.required, Validators.maxLength(500)]],
    reference: [''],
    notes: [''],
  });

  readonly formValue = signal(this.form.getRawValue());
  readonly saving = signal(false);
  readonly formSubmitAttempted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly staleConflictMessage = signal<string | null>(null);
  readonly overriddenAuthoritativeBalance = signal<string | null>(null);

  readonly supplierName = computed(() => this.supplier()?.name ?? 'Supplier');

  readonly currentBalance = computed(() => {
    if (this.overriddenAuthoritativeBalance() !== null) {
      return this.overriddenAuthoritativeBalance()!;
    }
    const s = this.supplier();
    const type = this.formValue().balanceType;
    if (type === 'supplier_payable') {
      return s?.derivedBalances?.payable?.amount ?? '0.00';
    }
    if (type === 'supplier_advance') {
      return s?.derivedBalances?.advance?.amount ?? '0.00';
    }
    return '0.00';
  });

  readonly currentBalanceFormatted = computed(() => {
    const n = Number(this.currentBalance());
    if (isNaN(n)) return '0.00';
    return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  readonly desiredBalanceFormatted = computed(() => {
    const n = Number(this.formValue().desiredBalance);
    if (isNaN(n)) return '0.00';
    return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  readonly deltaAmount = computed(() => {
    const cur = Number(this.currentBalance());
    const des = Number(this.formValue().desiredBalance);
    if (isNaN(cur) || isNaN(des)) return 0;
    return des - cur;
  });

  readonly deltaFormatted = computed(() => {
    const d = this.deltaAmount();
    const sign = d > 0 ? '+' : d < 0 ? '-' : '';
    const abs = Math.abs(d).toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${sign} PKR ${abs}`;
  });

  readonly hasEnteredDesired = computed(() => {
    const val = this.formValue().desiredBalance;
    return val !== null && val !== undefined && val !== '';
  });

  readonly isInvalidDesired = computed(() => {
    if (!this.hasEnteredDesired()) return true;
    const num = Number(this.formValue().desiredBalance);
    return isNaN(num) || num < 0;
  });

  readonly isNoOp = computed(() => {
    if (!this.hasEnteredDesired()) return false;
    const cur = Number(this.currentBalance());
    const des = Number(this.formValue().desiredBalance);
    return !isNaN(cur) && !isNaN(des) && Math.abs(des - cur) < 0.0001;
  });

  readonly currentHelperText = computed(() => {
    const type = this.formValue().balanceType;
    switch (type) {
      case 'supplier_payable':
        return 'Use this only to correct the recorded Supplier Payable balance. If you actually paid the supplier, use Supplier Payment.';
      case 'supplier_advance':
        return 'Use this only to correct the recorded Supplier Advance. If the supplier actually returned money, use Record Refund.';
      default:
        return '';
    }
  });

  constructor() {
    this.form.valueChanges.subscribe(() => {
      this.formValue.set(this.form.getRawValue());
    });

    effect(() => {
      if (this.open()) {
        this.reset();
      }
    });

    this.form.controls.balanceType.valueChanges.subscribe(() => {
      this.overriddenAuthoritativeBalance.set(null);
      this.staleConflictMessage.set(null);
    });
  }

  private reset(): void {
    this.form.reset({
      balanceType: 'supplier_payable',
      desiredBalance: '',
      category: 'reconciliation',
      businessDate: new Date().toISOString().slice(0, 10),
      reason: '',
      reference: '',
      notes: '',
    });
    this.formValue.set(this.form.getRawValue());
    this.formSubmitAttempted.set(false);
    this.errorMessage.set(null);
    this.staleConflictMessage.set(null);
    this.overriddenAuthoritativeBalance.set(null);
    this.saving.set(false);
  }

  onDismiss(): void {
    if (!this.saving()) {
      this.closed.emit(false);
      this.dismiss.emit();
    }
  }

  submit(): void {
    const s = this.supplier();
    if (!s) return;

    this.formSubmitAttempted.set(true);
    this.errorMessage.set(null);
    this.staleConflictMessage.set(null);

    const val = this.form.getRawValue();

    if (this.form.invalid || this.isNoOp() || this.isInvalidDesired() || this.saving()) {
      return;
    }

    const expectedAmount = Number(this.currentBalance()).toFixed(2);
    const desiredAmount = Number(val.desiredBalance).toFixed(2);

    this.saving.set(true);
    const idempotencyKey = crypto.randomUUID();

    this.supplierFinanceApi
      .adjustBalance(
        {
          supplierId: s.id,
          balanceType: val.balanceType!,
          expectedCurrentBalance: { amount: expectedAmount, currency: 'PKR' },
          desiredBalance: { amount: desiredAmount, currency: 'PKR' },
          reason: val.reason!.trim(),
          category: val.category!,
          businessDate: val.businessDate!,
          reference: val.reference?.trim() ? val.reference.trim() : null,
          notes: val.notes?.trim() ? val.notes.trim() : null,
        },
        idempotencyKey,
      )
      .subscribe({
        next: (adjustment) => {
          this.saving.set(false);
          this.balanceAdjusted.emit(adjustment);
          this.dismiss.emit();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (err instanceof HttpErrorResponse) {
            if (err.status === 409) {
              const latest =
                err.error?.details?.latestBalance?.amount ??
                err.error?.error?.details?.latestBalance?.amount;
              if (latest) {
                this.overriddenAuthoritativeBalance.set(latest);
                const typeLabel =
                  val.balanceType === 'supplier_payable'
                    ? 'Supplier Payable'
                    : 'Supplier Advance';
                this.staleConflictMessage.set(
                  `The supplier balance changed since this form was opened. Current ${typeLabel} is PKR ${latest}. Review before posting the adjustment.`,
                );
                return;
              }
            }
            this.errorMessage.set(
              err.error?.error?.message ?? err.error?.message ?? 'Failed to adjust balance.',
            );
          } else {
            this.errorMessage.set('Failed to adjust balance.');
          }
        },
      });
  }
}
