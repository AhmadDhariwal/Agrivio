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
import { formatAccountOption } from '../../../../shared/ui/ui-searchable-dropdown/entity-dropdown-formatters';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { SupplierFinanceApi } from '../../data-access/supplier-finance.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { SupplierRecord, SupplierRefundRecord } from '../../models/suppliers.models';

function positiveMoneyValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value;
  if (!val) return null;
  const num = Number(val);
  if (isNaN(num) || num <= 0) {
    return { positiveMoney: true };
  }
  return null;
}

const LIQUID_ACCOUNT_TYPES = new Set(['cash', 'bank', 'jazzcash', 'easypaisa']);

function isLiquidAccount(a: AccountRecord): boolean {
  if (a.status !== 'active') return false;
  if ((a as { isLiquid?: boolean }).isLiquid === false) return false;
  return !a.accountType || LIQUID_ACCOUNT_TYPES.has(a.accountType);
}

@Component({
  selector: 'agrivio-record-supplier-refund-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiDialogComponent,
    UiFieldLabelComponent,
    UiSearchableDropdownComponent,
    UiAlertComponent,
  ],
  templateUrl: './record-supplier-refund-dialog.component.html',
  styleUrl: './record-supplier-refund-dialog.component.scss',
})
export class RecordSupplierRefundDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly accountsApi = inject(AccountsApi);
  private readonly supplierFinanceApi = inject(SupplierFinanceApi);

  readonly open = input(false);
  readonly supplier = input<SupplierRecord | null>(null);

  readonly dismiss = output<void>();
  readonly refundRecorded = output<SupplierRefundRecord>();
  readonly closed = output<boolean>();

  readonly accounts = signal<AccountRecord[]>([]);
  readonly overriddenAdvance = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formSubmitAttempted = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group({
    accountId: ['', Validators.required],
    amount: ['', [Validators.required, positiveMoneyValidator]],
    businessDate: [new Date().toISOString().slice(0, 10), Validators.required],
    reference: [''],
    notes: [''],
  });

  readonly formValue = signal(this.form.getRawValue());

  readonly supplierName = computed(() => this.supplier()?.name ?? 'Supplier');

  readonly availableAdvance = computed(() => {
    if (this.overriddenAdvance() !== null) {
      return this.overriddenAdvance()!;
    }
    return this.supplier()?.derivedBalances?.advance?.amount ?? '0.00';
  });

  readonly availableAdvanceFormatted = computed(() => {
    const n = Number(this.availableAdvance());
    if (isNaN(n)) return '0.00';
    return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  readonly exceedsAdvance = computed(() => {
    const raw = this.formValue().amount;
    if (!raw) return false;
    const num = Number(raw);
    const max = Number(this.availableAdvance());
    if (isNaN(num) || isNaN(max)) return false;
    return num > max;
  });

  readonly isInvalidAmount = computed(() => {
    const raw = this.formValue().amount;
    if (!raw) return true;
    const num = Number(raw);
    return isNaN(num) || num <= 0;
  });

  readonly formattedAmount = computed(() => {
    const n = Number(this.formValue().amount);
    if (isNaN(n) || n <= 0) return '0.00';
    return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  readonly accountOptions = computed<DropdownOption[]>(() =>
    this.accounts()
      .filter((a) => isLiquidAccount(a))
      .map((a) => formatAccountOption(a)),
  );

  readonly selectedAccountName = computed(() => {
    const id = this.formValue().accountId;
    if (!id) return 'Account';
    const acc = this.accounts().find((a) => a.id === id);
    return acc ? acc.name : 'Account';
  });

  readonly hasPreview = computed(() => {
    return !this.isInvalidAmount() && !this.exceedsAdvance();
  });

  constructor() {
    this.form.valueChanges.subscribe(() => {
      this.formValue.set(this.form.getRawValue());
    });

    effect(() => {
      if (this.open()) {
        this.reset();
        this.loadAccounts();
      }
    });
  }

  private reset(): void {
    this.form.reset({
      accountId: '',
      amount: '',
      businessDate: new Date().toISOString().slice(0, 10),
      reference: '',
      notes: '',
    });
    this.formValue.set(this.form.getRawValue());
    this.formSubmitAttempted.set(false);
    this.errorMessage.set(null);
    this.overriddenAdvance.set(null);
    this.saving.set(false);
  }

  private loadAccounts(): void {
    this.accountsApi.listAccountOptions().subscribe({
      next: (accounts) => {
        this.accounts.set(accounts.filter((a) => isLiquidAccount(a)));
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
    const s = this.supplier();
    if (!s) return;

    this.formSubmitAttempted.set(true);
    this.errorMessage.set(null);

    if (this.form.invalid || this.exceedsAdvance() || this.isInvalidAmount() || this.saving()) {
      return;
    }

    const val = this.form.getRawValue();
    const formattedAmount = Number(val.amount).toFixed(2);

    this.saving.set(true);
    const idempotencyKey = crypto.randomUUID();

    this.supplierFinanceApi
      .postRefund(
        {
          supplierId: s.id,
          accountId: val.accountId!,
          amount: { amount: formattedAmount, currency: 'PKR' },
          businessDate: val.businessDate!,
          reference: val.reference?.trim() ? val.reference.trim() : null,
          notes: val.notes?.trim() ? val.notes.trim() : null,
        },
        idempotencyKey,
      )
      .subscribe({
        next: (refund) => {
          this.saving.set(false);
          this.refundRecorded.emit(refund);
          this.dismiss.emit();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (err instanceof HttpErrorResponse) {
            const details = err.error?.details ?? err.error?.error?.details;
            if (Array.isArray(details) && details.length > 0) {
              const first = details[0];
              if (first?.latestAvailableAdvance?.amount) {
                this.overriddenAdvance.set(first.latestAvailableAdvance.amount);
              }
            }
            this.errorMessage.set(
              err.error?.error?.message ?? err.error?.message ?? 'Failed to record supplier refund.',
            );
          } else {
            this.errorMessage.set('Failed to record supplier refund.');
          }
        },
      });
  }
}
