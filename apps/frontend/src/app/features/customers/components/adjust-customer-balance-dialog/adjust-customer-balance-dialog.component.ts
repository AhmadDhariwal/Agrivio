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
import {
  DropdownOption,
  UiSearchableDropdownComponent,
} from '../../../../shared/ui/ui-searchable-dropdown/ui-searchable-dropdown.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { CustomerFinanceApi } from '../../data-access/customer-finance.api';
import { CustomersApi } from '../../data-access/customers.api';
import {
  CustomerBalanceAdjustmentRecord,
  CustomerBalanceType,
  CustomerLoanRecord,
  CustomerRecord,
} from '../../models/customers.models';

function nonNegativeMoneyValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value;
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (isNaN(num) || num < 0) {
    return { invalidMoney: true };
  }
  return null;
}

export const CUSTOMER_ADJUSTMENT_CATEGORIES = [
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'correction', label: 'Balance Correction' },
  { value: 'unclassified', label: 'Unclassified' },
  { value: 'other', label: 'Other' },
] as const;

@Component({
  selector: 'agrivio-adjust-customer-balance-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiDialogComponent,
    UiFieldLabelComponent,
    UiSearchableDropdownComponent,
    UiAlertComponent,
  ],
  templateUrl: './adjust-customer-balance-dialog.component.html',
  styleUrl: './adjust-customer-balance-dialog.component.scss',
})
export class AdjustCustomerBalanceDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly customersApi = inject(CustomersApi);
  private readonly customerFinanceApi = inject(CustomerFinanceApi);

  readonly open = input(false);
  readonly customer = input<CustomerRecord | { id: string; name: string } | null>(null);

  readonly dismiss = output<void>();
  readonly balanceAdjusted = output<CustomerBalanceAdjustmentRecord>();
  readonly closed = output<boolean>();

  readonly categoryOptions = CUSTOMER_ADJUSTMENT_CATEGORIES;

  readonly form = this.fb.group({
    balanceType: ['trade_receivable' as CustomerBalanceType, Validators.required],
    loanId: [''],
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

  readonly customerLoans = signal<CustomerLoanRecord[]>([]);
  readonly overriddenAuthoritativeBalance = signal<string | null>(null);

  readonly customerName = computed(() => this.customer()?.name ?? 'Customer');

  readonly currentBalance = computed(() => {
    if (this.overriddenAuthoritativeBalance() !== null) {
      return this.overriddenAuthoritativeBalance()!;
    }
    const c = this.customer();
    const type = this.formValue().balanceType;
    if (type === 'trade_receivable') {
      return (c as any)?.derivedBalances?.receivable?.amount ?? '0.00';
    }
    if (type === 'customer_advance') {
      return (c as any)?.derivedBalances?.advance?.amount ?? '0.00';
    }
    if (type === 'loan_receivable') {
      const selectedId = this.formValue().loanId;
      const loan = this.customerLoans().find((l) => l.id === selectedId);
      return loan ? loan.outstanding.amount : '0.00';
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

  readonly isNoOp = computed(() => {
    if (!this.hasEnteredDesired()) return false;
    const cur = Number(this.currentBalance());
    const des = Number(this.formValue().desiredBalance);
    return !isNaN(cur) && !isNaN(des) && Math.abs(des - cur) < 0.0001;
  });

  readonly currentHelperText = computed(() => {
    const type = this.formValue().balanceType;
    switch (type) {
      case 'trade_receivable':
        return "Use this only to correct the customer's recorded receivable balance. If the customer actually paid money, use Receive Payment instead.";
      case 'customer_advance':
        return "Use this to correct an existing advance balance. If money was actually received now, use Customer Payment instead.";
      case 'loan_receivable':
        return "Use this for a balance correction only. If the customer actually repaid money, use Loan Repayment.";
      default:
        return '';
    }
  });

  readonly loanOptions = computed<DropdownOption[]>(() =>
    this.customerLoans().map((l) => ({
      value: l.id,
      label: `${l.reference || l.id} — Outstanding: PKR ${l.outstanding.amount}`,
    })),
  );

  constructor() {
    this.form.valueChanges.subscribe(() => {
      this.formValue.set(this.form.getRawValue());
    });

    effect(() => {
      if (this.open()) {
        this.reset();
        this.loadCustomerLoans();
      }
    });

    this.form.controls.balanceType.valueChanges.subscribe((type) => {
      this.overriddenAuthoritativeBalance.set(null);
      this.staleConflictMessage.set(null);
      if (type === 'loan_receivable') {
        const first = this.customerLoans()[0];
        if (first) {
          this.form.controls.loanId.setValue(first.id);
        }
      } else {
        this.form.controls.loanId.setValue('');
      }
    });

    this.form.controls.loanId.valueChanges.subscribe(() => {
      this.overriddenAuthoritativeBalance.set(null);
      this.staleConflictMessage.set(null);
    });
  }

  private reset(): void {
    this.form.reset({
      balanceType: 'trade_receivable',
      loanId: '',
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

  private loadCustomerLoans(): void {
    const c = this.customer();
    if (!c) return;
    this.customerFinanceApi.listLoans({ customerId: c.id, status: 'open' }).subscribe({
      next: (res) => {
        this.customerLoans.set(res.items);
        if (this.form.controls.balanceType.value === 'loan_receivable' && res.items.length > 0) {
          const firstLoan = res.items[0]; if (firstLoan) { this.form.controls.loanId.setValue(firstLoan.id); }
        }
      },
    });
  }

  onDismiss(): void {
    if (!this.saving()) {
      this.closed.emit(false);
      this.dismiss.emit();
    }
  }

  submit(): void {
    const c = this.customer();
    if (!c) return;

    this.formSubmitAttempted.set(true);
    this.errorMessage.set(null);
    this.staleConflictMessage.set(null);

    const val = this.form.getRawValue();

    if (val.balanceType === 'loan_receivable' && !val.loanId) {
      this.form.controls.loanId.setErrors({ required: true });
      return;
    }

    if (this.form.invalid || this.isNoOp() || this.saving()) {
      return;
    }

    const expectedAmount = Number(this.currentBalance()).toFixed(2);
    const desiredAmount = Number(val.desiredBalance).toFixed(2);

    this.saving.set(true);
    const idempotencyKey = crypto.randomUUID();

    this.customerFinanceApi
      .adjustBalance(
        {
          customerId: c.id,
          balanceType: val.balanceType!,
          loanId: val.balanceType === 'loan_receivable' ? val.loanId : null,
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
                  val.balanceType === 'trade_receivable'
                    ? 'Trade Receivable'
                    : val.balanceType === 'customer_advance'
                      ? 'Customer Advance'
                      : 'Loan Outstanding';
                this.staleConflictMessage.set(
                  `The customer balance changed since this form was opened. Current ${typeLabel} is PKR ${latest}. Review before posting the adjustment.`,
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
