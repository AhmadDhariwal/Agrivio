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
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { formatAccountOption } from '../../../../shared/ui/ui-searchable-dropdown/entity-dropdown-formatters';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { CustomerFinanceApi } from '../../data-access/customer-finance.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { CustomerLoanRecord, CustomerLoanDetailRecord, CustomerLoanStatus } from '../../models/customers.models';

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
  selector: 'agrivio-repay-loan-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiDialogComponent,
    UiFieldLabelComponent,
    UiSearchableDropdownComponent,
    UiAlertComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './repay-loan-dialog.component.html',
  styleUrl: './repay-loan-dialog.component.scss',
})
export class RepayLoanDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly accountsApi = inject(AccountsApi);
  private readonly customerFinanceApi = inject(CustomerFinanceApi);

  readonly open = input(false);
  readonly loan = input<CustomerLoanRecord | CustomerLoanDetailRecord | null>(null);
  readonly customerLoans = input<CustomerLoanRecord[] | null>(null);
  readonly customerId = input<string | null>(null);

  readonly dismiss = output<void>();
  readonly repaymentRecorded = output<any>();
  readonly closed = output<boolean>();

  readonly fetchedLoans = signal<CustomerLoanRecord[]>([]);

  readonly allLoans = computed<CustomerLoanRecord[]>(() => {
    const passed = this.customerLoans();
    if (passed && passed.length > 0) return passed;
    return this.fetchedLoans();
  });

  readonly form = this.fb.group({
    loanId: ['', Validators.required],
    accountId: ['', Validators.required],
    amount: ['', [Validators.required, positiveMoneyValidator]],
    businessDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    reference: [''],
    notes: [''],
  });

  readonly formValue = signal(this.form.getRawValue());

  readonly saving = signal(false);
  readonly formSubmitAttempted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly conflictMessage = signal<string | null>(null);
  readonly overriddenOutstanding = signal<string | null>(null);

  readonly accounts = signal<AccountRecord[]>([]);

  readonly accountOptions = computed<DropdownOption[]>(() =>
    this.accounts().map(formatAccountOption),
  );

  readonly activeLoan = computed<CustomerLoanRecord | CustomerLoanDetailRecord | null>(() => {
    const direct = this.loan();
    if (direct) return direct;
    const selectedId = this.formValue().loanId;
    const list = this.allLoans();
    if (list && selectedId) {
      return list.find((l) => l.id === selectedId) ?? null;
    }
    return null;
  });

  readonly loanOptions = computed<DropdownOption[]>(() => {
    const list = this.allLoans();
    if (!list) return [];
    return list
      .filter((l) => l.status === 'open' || l.status === 'partially_repaid')
      .map((l) => ({
        value: l.id,
        label: `${l.reference || l.id} — Outstanding: PKR ${l.outstanding.amount}`,
      }));
  });

  readonly currentOutstanding = computed(() => {
    if (this.overriddenOutstanding()) return this.overriddenOutstanding()!;
    const l = this.activeLoan();
    return l ? l.outstanding.amount : '0.00';
  });

  readonly isOverpayment = computed(() => {
    const entered = Number(this.formValue().amount);
    const max = Number(this.currentOutstanding());
    if (!entered || isNaN(entered) || isNaN(max)) return false;
    return entered > max + 0.0001;
  });

  readonly selectedAccountName = computed(() => {
    const aid = this.formValue().accountId;
    const found = this.accounts().find((a) => a.id === aid);
    return found ? found.name : 'Account';
  });

  readonly formattedAmount = computed(() => {
    const amt = Number(this.formValue().amount);
    if (!amt || isNaN(amt)) return '0.00';
    return amt.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  readonly formatRemaining = computed(() => {
    const entered = Number(this.formValue().amount);
    const max = Number(this.currentOutstanding());
    if (!entered || isNaN(entered) || isNaN(max)) return `PKR ${this.currentOutstanding()}`;
    const rem = Math.max(0, max - entered);
    return `PKR ${rem.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  });

  readonly hasPreview = computed(() => {
    const val = this.formValue();
    const amt = Number(val.amount);
    return Boolean(
      (this.loan() || val.loanId) &&
      val.accountId &&
      amt > 0 &&
      !this.isOverpayment()
    );
  });

  constructor() {
    this.form.valueChanges.subscribe(() => {
      this.formValue.set(this.form.getRawValue());
    });

    effect(() => {
      if (this.open()) {
        this.reset();
        this.loadAccounts();
        const cid = this.customerId();
        if (cid && !this.loan()) {
          this.customerFinanceApi.listLoans({ customerId: cid, status: 'open' }).subscribe({
            next: (res) => this.fetchedLoans.set(res.items),
          });
        }
      }
    });
  }

  private reset(): void {
    const l = this.loan();
    this.form.reset({
      loanId: l?.id ?? '',
      accountId: '',
      amount: '',
      businessDate: new Date().toISOString().slice(0, 10),
      reference: '',
      notes: '',
    });
    this.formValue.set(this.form.getRawValue());
    this.formSubmitAttempted.set(false);
    this.errorMessage.set(null);
    this.conflictMessage.set(null);
    this.overriddenOutstanding.set(null);
    this.saving.set(false);
  }

  private loadAccounts(): void {
    this.accountsApi.listAccountOptions().subscribe({
      next: (items) => this.accounts.set(items.filter((a) => a.status === 'active')),
      error: () => this.errorMessage.set('Unable to load liquid accounts.'),
    });
  }

  humanStatus(status?: CustomerLoanStatus | string): string {
    switch (status) {
      case 'open':
        return 'Open';
      case 'partially_repaid':
        return 'Partially Repaid';
      case 'repaid':
        return 'Repaid';
      case 'reversed':
        return 'Reversed';
      default:
        return status ? String(status) : 'Open';
    }
  }

  statusTone(status?: CustomerLoanStatus | string): UiBadgeTone {
    switch (status) {
      case 'open':
        return 'primary';
      case 'partially_repaid':
        return 'warning';
      case 'repaid':
        return 'success';
      case 'reversed':
        return 'danger';
      default:
        return 'neutral';
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
    this.conflictMessage.set(null);

    const l = this.activeLoan();
    const loanId = l?.id ?? this.form.controls.loanId.value;
    if (!loanId) {
      this.errorMessage.set('Please select a loan to repay.');
      return;
    }

    if (this.form.invalid || this.isOverpayment() || this.saving()) {
      return;
    }

    const val = this.form.getRawValue();
    const repaymentAmount = Number(val.amount).toFixed(2);

    this.saving.set(true);
    const idempotencyKey = crypto.randomUUID();

    this.customerFinanceApi
      .repayLoan(
        loanId,
        {
          accountId: val.accountId!,
          amount: { amount: repaymentAmount, currency: 'PKR' },
          businessDate: val.businessDate!,
          reference: val.reference?.trim() ? val.reference.trim() : null,
          notes: val.notes?.trim() ? val.notes.trim() : null,
        },
        idempotencyKey,
      )
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.repaymentRecorded.emit(result);
          this.closed.emit(true);
          this.dismiss.emit();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (err instanceof HttpErrorResponse) {
            const details = err.error?.details ?? err.error?.error?.details;
            if (Array.isArray(details) && details[0]?.latestOutstanding?.amount) {
              const latest = details[0].latestOutstanding.amount;
              this.overriddenOutstanding.set(latest);
              this.conflictMessage.set(
                `The loan outstanding balance changed. Current outstanding is PKR ${latest}. Review before submitting.`,
              );
              return;
            }
            this.errorMessage.set(
              err.error?.error?.message ?? err.error?.message ?? 'Failed to record repayment.',
            );
          } else {
            this.errorMessage.set('Failed to record repayment.');
          }
        },
      });
  }
}
