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
import { formatAccountOption, formatCustomerOption } from '../../../../shared/ui/ui-searchable-dropdown/entity-dropdown-formatters';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { CustomersApi } from '../../data-access/customers.api';
import { CustomerFinanceApi } from '../../data-access/customer-finance.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { CustomerLoanRecord, CustomerRecord } from '../../models/customers.models';

function positiveMoneyValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value;
  if (!val) return null;
  const num = Number(val);
  if (isNaN(num) || num <= 0) {
    return { positiveMoney: true };
  }
  return null;
}

@Component({
  selector: 'agrivio-give-loan-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiDialogComponent,
    UiFieldLabelComponent,
    UiSearchableDropdownComponent,
    UiAlertComponent,
  ],
  templateUrl: './give-loan-dialog.component.html',
  styleUrl: './give-loan-dialog.component.scss',
})
export class GiveLoanDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly accountsApi = inject(AccountsApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly customerFinanceApi = inject(CustomerFinanceApi);

  readonly open = input(false);
  readonly customer = input<{ id: string; name: string } | null>(null);
  readonly preselectedCustomer = input<{ id: string; name: string } | null>(null);

  readonly targetCustomer = computed(() => this.customer() ?? this.preselectedCustomer());

  readonly dismiss = output<void>();
  readonly loanCreated = output<CustomerLoanRecord>();
  readonly closed = output<boolean>();

  readonly form = this.fb.group({
    customerId: ['', Validators.required],
    disbursementAccountId: ['', Validators.required],
    amount: ['', [Validators.required, positiveMoneyValidator]],
    businessDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    dueDate: [''],
    reference: [''],
    notes: [''],
  });

  readonly formValue = signal(this.form.getRawValue());

  readonly saving = signal(false);
  readonly formSubmitAttempted = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly customers = signal<CustomerRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);

  readonly customerOptions = computed<DropdownOption[]>(() =>
    this.customers().map(formatCustomerOption),
  );

  readonly accountOptions = computed<DropdownOption[]>(() =>
    this.accounts().map(formatAccountOption),
  );

  readonly selectedCustomerName = computed(() => {
    const pre = this.targetCustomer();
    if (pre) return pre.name;
    const cid = this.formValue().customerId;
    const found = this.customers().find((c) => c.id === cid);
    return found ? found.name : '—';
  });

  readonly selectedAccountName = computed(() => {
    const aid = this.formValue().disbursementAccountId;
    const found = this.accounts().find((a) => a.id === aid);
    return found ? found.name : 'Account';
  });

  readonly formattedAmount = computed(() => {
    const amt = Number(this.formValue().amount);
    if (!amt || isNaN(amt)) return '0.00';
    return amt.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  readonly hasPreview = computed(() => {
    const val = this.formValue();
    const amt = Number(val.amount);
    return Boolean(
      (this.targetCustomer() || val.customerId) &&
      val.disbursementAccountId &&
      amt > 0
    );
  });

  constructor() {
    this.form.valueChanges.subscribe(() => {
      this.formValue.set(this.form.getRawValue());
    });

    effect(() => {
      if (this.open()) {
        this.reset();
        this.loadReferenceData();
      }
    });
  }

  private reset(): void {
    const pre = this.targetCustomer();
    this.form.reset({
      customerId: pre?.id ?? '',
      disbursementAccountId: '',
      amount: '',
      businessDate: new Date().toISOString().slice(0, 10),
      dueDate: '',
      reference: '',
      notes: '',
    });
    this.formValue.set(this.form.getRawValue());
    this.formSubmitAttempted.set(false);
    this.errorMessage.set(null);
    this.saving.set(false);
  }

  private loadReferenceData(): void {
    this.accountsApi.listAccountOptions().subscribe({
      next: (items) => this.accounts.set(items.filter((a) => a.status === 'active')),
      error: () => this.errorMessage.set('Unable to load liquid accounts.'),
    });

    if (!this.targetCustomer()) {
      this.customersApi.searchCustomerOptions('').subscribe({
        next: (items) => this.customers.set(items.filter((c) => c.status === 'active')),
        error: () => this.errorMessage.set('Unable to load customers.'),
      });
    }
  }

  onDismiss(): void {
    if (!this.saving()) {
      this.closed.emit(false);
      this.dismiss.emit();
    }
  }

  submit(): void {
    this.formSubmitAttempted.set(true);
    this.errorMessage.set(null);

    const pre = this.targetCustomer();
    if (pre && !this.form.controls.customerId.value) {
      this.form.controls.customerId.setValue(pre.id);
    }

    if (this.form.invalid || this.saving()) {
      return;
    }

    const val = this.form.getRawValue();
    const principalAmount = Number(val.amount).toFixed(2);

    this.saving.set(true);
    const idempotencyKey = crypto.randomUUID();

    this.customerFinanceApi
      .createLoan(
        {
          customerId: val.customerId!,
          disbursementAccountId: val.disbursementAccountId!,
          principal: { amount: principalAmount, currency: 'PKR' },
          businessDate: val.businessDate!,
          dueDate: val.dueDate?.trim() ? val.dueDate.trim() : null,
          reference: val.reference?.trim() ? val.reference.trim() : null,
          notes: val.notes?.trim() ? val.notes.trim() : null,
        },
        idempotencyKey,
      )
      .subscribe({
        next: (loan) => {
          this.saving.set(false);
          this.loanCreated.emit(loan);
          this.closed.emit(true);
          this.dismiss.emit();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(
            err instanceof HttpErrorResponse
              ? (err.error?.error?.message ?? err.error?.message ?? 'Failed to disburse loan.')
              : 'Failed to disburse loan.',
          );
        },
      });
  }
}

export { GiveLoanDialogComponent as GiveCustomerLoanDialogComponent };
