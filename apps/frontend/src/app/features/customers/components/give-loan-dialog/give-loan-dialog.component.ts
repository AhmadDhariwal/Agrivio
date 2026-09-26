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
  template: `
    <agrivio-ui-dialog
      [open]="open()"
      title="Give Customer Loan"
      description="Record principal disbursed to a customer as a durable loan receivable."
      size="md"
      (dismiss)="onDismiss()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" class="give-loan-form" novalidate>
        @if (errorMessage()) {
          <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
        }

        <div class="helper-box">
          <p class="helper-text">
            <strong>Note:</strong> This records money lent to the customer. It is not a Sale or Expense.
          </p>
        </div>

        <div class="form-grid">
          <!-- Customer -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Customer" [required]="true" for="loan-customer" />
            @if (preselectedCustomer(); as pre) {
              <div class="static-value-box" data-testid="loan-preselected-customer">
                <strong>{{ pre.name }}</strong>
              </div>
            } @else {
              <agrivio-ui-searchable-dropdown
                id="loan-customer"
                testId="loan-customer"
                formControlName="customerId"
                [options]="customerOptions()"
                placeholder="Select customer"
                [searchable]="true"
                [clearable]="false"
                [serverSearch]="false"
              />
            }
            @if (formSubmitAttempted() && form.controls.customerId.errors?.['required']) {
              <p class="field-error" role="alert">Customer is required.</p>
            }
          </div>

          <!-- Pay From Account -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Pay From (Disbursement Account)" [required]="true" for="loan-account" />
            <agrivio-ui-searchable-dropdown
              id="loan-account"
              testId="loan-account"
              formControlName="disbursementAccountId"
              [options]="accountOptions()"
              placeholder="Select cash, bank, or wallet account"
              [searchable]="true"
              [clearable]="false"
              [serverSearch]="false"
            />
            @if (formSubmitAttempted() && form.controls.disbursementAccountId.errors?.['required']) {
              <p class="field-error" role="alert">Disbursement account is required.</p>
            }
          </div>

          <!-- Principal Amount -->
          <div class="form-field">
            <agrivio-ui-field-label label="Amount (PKR)" [required]="true" for="loan-amount" />
            <input
              id="loan-amount"
              type="text"
              inputmode="decimal"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.amount.invalid"
              formControlName="amount"
              placeholder="0.00"
              data-testid="loan-amount-input"
            />
            @if (formSubmitAttempted() && form.controls.amount.errors?.['required']) {
              <p class="field-error" role="alert">Loan amount is required.</p>
            } @else if (formSubmitAttempted() && form.controls.amount.errors?.['positiveMoney']) {
              <p class="field-error" role="alert">Amount must be greater than zero.</p>
            }
          </div>

          <!-- Business Date -->
          <div class="form-field">
            <agrivio-ui-field-label label="Business Date" [required]="true" for="loan-business-date" />
            <input
              id="loan-business-date"
              type="date"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.businessDate.invalid"
              formControlName="businessDate"
              data-testid="loan-business-date-input"
            />
            @if (formSubmitAttempted() && form.controls.businessDate.errors?.['required']) {
              <p class="field-error" role="alert">Business date is required.</p>
            }
          </div>

          <!-- Due Date (Optional) -->
          <div class="form-field">
            <agrivio-ui-field-label label="Due Date (Optional)" [required]="false" for="loan-due-date" />
            <input
              id="loan-due-date"
              type="date"
              class="ag-input"
              formControlName="dueDate"
              data-testid="loan-due-date-input"
            />
          </div>

          <!-- Reference (Optional) -->
          <div class="form-field">
            <agrivio-ui-field-label label="Reference (Optional)" [required]="false" for="loan-reference" />
            <input
              id="loan-reference"
              type="text"
              class="ag-input"
              formControlName="reference"
              placeholder="e.g. LOAN-2026-001"
              maxlength="160"
              data-testid="loan-reference-input"
            />
          </div>

          <!-- Notes (Optional) -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Notes (Optional)" [required]="false" for="loan-notes" />
            <textarea
              id="loan-notes"
              class="ag-input"
              formControlName="notes"
              placeholder="Optional loan disbursement notes"
              rows="2"
              maxlength="1000"
              data-testid="loan-notes-input"
            ></textarea>
          </div>
        </div>

        <!-- Summary Preview Box -->
        @if (hasPreview()) {
          <div class="preview-box" data-testid="loan-summary-preview">
            <h4 class="preview-title">Disbursement Preview</h4>
            <div class="preview-grid">
              <div class="preview-item">
                <span class="preview-label">Customer</span>
                <strong class="preview-val">{{ selectedCustomerName() }}</strong>
              </div>
              <div class="preview-item">
                <span class="preview-label">Loan Receivable</span>
                <strong class="preview-val preview-val--pos">+ PKR {{ formattedAmount() }}</strong>
              </div>
              <div class="preview-item">
                <span class="preview-label">{{ selectedAccountName() }}</span>
                <strong class="preview-val preview-val--neg">- PKR {{ formattedAmount() }}</strong>
              </div>
            </div>
          </div>
        }

        <div dialog-actions class="dialog-actions">
          <button
            type="button"
            class="ag-btn ag-btn--secondary"
            (click)="onDismiss()"
            [disabled]="saving()"
            data-testid="loan-cancel-btn"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="ag-btn ag-btn--primary"
            [disabled]="saving()"
            data-testid="loan-submit-btn"
          >
            {{ saving() ? 'Disbursing…' : 'Give Customer Loan' }}
          </button>
        </div>
      </form>
    </agrivio-ui-dialog>
  `,
  styles: [`
    .give-loan-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .helper-box {
      background: var(--color-surface-subtle, #f8fafc);
      border: 1px solid var(--color-border-subtle, #e2e8f0);
      border-radius: 6px;
      padding: 0.75rem 1rem;
    }
    .helper-text {
      margin: 0;
      font-size: 0.875rem;
      color: var(--color-text-secondary, #475569);
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.875rem;
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .form-field--full {
      grid-column: span 2;
    }
    .static-value-box {
      padding: 0.5rem 0.75rem;
      background: var(--color-surface-subtle, #f8fafc);
      border: 1px solid var(--color-border, #cbd5e1);
      border-radius: 6px;
      font-size: 0.9375rem;
    }
    .preview-box {
      background: var(--color-surface-highlight, #f0fdf4);
      border: 1px solid var(--color-border-success, #bbf7d0);
      border-radius: 6px;
      padding: 0.875rem;
    }
    .preview-title {
      margin: 0 0 0.5rem;
      font-size: 0.8125rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary, #15803d);
    }
    .preview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 0.75rem;
    }
    .preview-item {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .preview-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, #64748b);
    }
    .preview-val {
      font-size: 0.9375rem;
    }
    .preview-val--pos {
      color: #166534;
    }
    .preview-val--neg {
      color: #991b1b;
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
    @media (max-width: 640px) {
      .form-grid {
        grid-template-columns: 1fr;
      }
      .form-field--full {
        grid-column: span 1;
      }
    }
  `],
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
