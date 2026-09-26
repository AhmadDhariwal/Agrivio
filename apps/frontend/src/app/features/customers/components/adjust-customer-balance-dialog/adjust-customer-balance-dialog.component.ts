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
  template: `
    <agrivio-ui-dialog
      [open]="open()"
      title="Adjust Customer Balance"
      description="Correct recorded financial position through an authoritative ledger adjustment."
      size="md"
      (dismiss)="onDismiss()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" class="adjust-form" novalidate>
        <!-- Stale Balance Conflict Alert -->
        @if (staleConflictMessage()) {
          <div class="stale-alert-wrap" data-testid="customer-stale-conflict-alert">
            <agrivio-ui-alert tone="warning" [message]="staleConflictMessage()!" role="alert" />
          </div>
        }

        @if (errorMessage()) {
          <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
        }

        <div class="form-grid">
          <!-- Customer Display -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Customer" [required]="true" />
            <div class="static-box" data-testid="adjust-customer-name">
              <strong>{{ customerName() }}</strong>
            </div>
          </div>

          <!-- Balance Type Selector -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Balance Type" [required]="true" />
            <div class="radio-group" role="radiogroup" aria-label="Balance Type">
              <label class="radio-label">
                <input
                  type="radio"
                  name="balanceType"
                  value="trade_receivable"
                  formControlName="balanceType"
                  data-testid="balance-type-trade"
                />
                <span>Trade Receivable</span>
              </label>
              <label class="radio-label">
                <input
                  type="radio"
                  name="balanceType"
                  value="customer_advance"
                  formControlName="balanceType"
                  data-testid="balance-type-advance"
                />
                <span>Customer Advance</span>
              </label>
              <label class="radio-label">
                <input
                  type="radio"
                  name="balanceType"
                  value="loan_receivable"
                  formControlName="balanceType"
                  data-testid="balance-type-loan"
                />
                <span>Loan Receivable</span>
              </label>
            </div>
          </div>

          <!-- Dynamic Helper Text depending on Balance Type -->
          <div class="helper-box form-field--full" data-testid="adjust-helper-box">
            <p class="helper-text">{{ currentHelperText() }}</p>
          </div>

          <!-- Loan Selector (When Loan Receivable selected) -->
          @if (formValue().balanceType === 'loan_receivable') {
            <div class="form-field form-field--full">
              <agrivio-ui-field-label label="Select Loan to Adjust" [required]="true" for="adjust-loan-select" />
              @if (customerLoans().length > 0) {
                <agrivio-ui-searchable-dropdown
                  id="adjust-loan-select"
                  testId="adjust-loan-select"
                  formControlName="loanId"
                  [options]="loanOptions()"
                  placeholder="Select loan"
                  [searchable]="true"
                  [clearable]="false"
                  [serverSearch]="false"
                />
              } @else {
                <p class="ag-muted" data-testid="adjust-no-loans">No active loans found for this customer.</p>
              }
              @if (formSubmitAttempted() && form.controls.loanId.errors?.['required']) {
                <p class="field-error" role="alert">Specific loan is required for loan adjustment.</p>
              }
            </div>
          }

          <!-- Current Balance Display -->
          <div class="balance-card form-field--full" data-testid="adjust-current-display">
            <span class="balance-card__label">Current Authoritative Balance</span>
            <strong class="balance-card__value" data-testid="adjust-current-value">PKR {{ currentBalanceFormatted() }}</strong>
          </div>

          <!-- Desired / Correct Balance Input -->
          <div class="form-field">
            <agrivio-ui-field-label label="Correct / Desired Balance (PKR)" [required]="true" for="adjust-desired-balance" />
            <input
              id="adjust-desired-balance"
              type="text"
              inputmode="decimal"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.desiredBalance.invalid"
              formControlName="desiredBalance"
              placeholder="0.00"
              data-testid="adjust-desired-input"
            />
            @if (formSubmitAttempted() && form.controls.desiredBalance.errors?.['required']) {
              <p class="field-error" role="alert">Desired balance is required.</p>
            } @else if (formSubmitAttempted() && form.controls.desiredBalance.errors?.['invalidMoney']) {
              <p class="field-error" role="alert">Balance must be a valid non-negative number.</p>
            }
          </div>

          <!-- Business Date -->
          <div class="form-field">
            <agrivio-ui-field-label label="Business Date" [required]="true" for="adjust-business-date" />
            <input
              id="adjust-business-date"
              type="date"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.businessDate.invalid"
              formControlName="businessDate"
              data-testid="adjust-business-date-input"
            />
            @if (formSubmitAttempted() && form.controls.businessDate.errors?.['required']) {
              <p class="field-error" role="alert">Business date is required.</p>
            }
          </div>

          <!-- Category -->
          <div class="form-field">
            <agrivio-ui-field-label label="Adjustment Category" [required]="true" for="adjust-category" />
            <select
              id="adjust-category"
              class="ag-input"
              formControlName="category"
              data-testid="adjust-category-select"
            >
              @for (cat of categoryOptions; track cat.value) {
                <option [value]="cat.value">{{ cat.label }}</option>
              }
            </select>
          </div>

          <!-- Reference (Optional) -->
          <div class="form-field">
            <agrivio-ui-field-label label="Reference (Optional)" [required]="false" for="adjust-reference" />
            <input
              id="adjust-reference"
              type="text"
              class="ag-input"
              formControlName="reference"
              placeholder="e.g. ADJ-REC-01"
              maxlength="160"
              data-testid="adjust-reference-input"
            />
          </div>

          <!-- Reason -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Reason" [required]="true" for="adjust-reason" />
            <textarea
              id="adjust-reason"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.reason.invalid"
              formControlName="reason"
              placeholder="Detailed explanation for balance correction"
              rows="2"
              maxlength="500"
              data-testid="adjust-reason-input"
            ></textarea>
            @if (formSubmitAttempted() && form.controls.reason.errors?.['required']) {
              <p class="field-error" role="alert">Reason is required.</p>
            }
          </div>

          <!-- Notes (Optional) -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Notes (Optional)" [required]="false" for="adjust-notes" />
            <textarea
              id="adjust-notes"
              class="ag-input"
              formControlName="notes"
              placeholder="Optional notes"
              rows="1"
              maxlength="1000"
              data-testid="adjust-notes-input"
            ></textarea>
          </div>
        </div>

        <!-- Delta / No-Op Preview -->
        @if (hasEnteredDesired()) {
          @if (isNoOp()) {
            <div class="noop-box" data-testid="adjust-noop-message">
              <span class="noop-icon" aria-hidden="true">ℹ</span>
              <span>No adjustment is required. Desired balance matches current authoritative balance.</span>
            </div>
          } @else {
            <div class="preview-box" data-testid="adjust-delta-preview">
              <div class="preview-item">
                <span class="preview-label">Current</span>
                <span>PKR {{ currentBalanceFormatted() }}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Desired</span>
                <span>PKR {{ desiredBalanceFormatted() }}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Adjustment Delta</span>
                <strong [class.text-pos]="deltaAmount() > 0" [class.text-neg]="deltaAmount() < 0" data-testid="adjust-delta-value">
                  {{ deltaFormatted() }}
                </strong>
              </div>
            </div>
          }
        }

        <div dialog-actions class="dialog-actions">
          <button
            type="button"
            class="ag-btn ag-btn--secondary"
            (click)="onDismiss()"
            [disabled]="saving()"
            data-testid="adjust-cancel-btn"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="ag-btn ag-btn--primary"
            [disabled]="saving() || isNoOp() || (formValue().balanceType === 'loan_receivable' && !formValue().loanId)"
            data-testid="adjust-submit-btn"
          >
            {{ saving() ? 'Posting…' : 'Post Balance Adjustment' }}
          </button>
        </div>
      </form>
    </agrivio-ui-dialog>
  `,
  styles: [`
    .adjust-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
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
    .static-box {
      padding: 0.5rem 0.75rem;
      background: var(--color-surface-subtle, #f8fafc);
      border: 1px solid var(--color-border, #cbd5e1);
      border-radius: 6px;
      font-size: 0.9375rem;
    }
    .radio-group {
      display: flex;
      gap: 1.25rem;
      padding: 0.5rem 0;
      flex-wrap: wrap;
    }
    .radio-label {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      cursor: pointer;
      font-size: 0.875rem;
    }
    .helper-box {
      background: var(--color-surface-subtle, #f8fafc);
      border: 1px solid var(--color-border-subtle, #e2e8f0);
      border-radius: 6px;
      padding: 0.625rem 0.875rem;
    }
    .helper-text {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--color-text-secondary, #475569);
      line-height: 1.4;
    }
    .balance-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: var(--color-surface-subtle, #f8fafc);
      border: 1px solid var(--color-border, #cbd5e1);
      border-radius: 6px;
    }
    .balance-card__label {
      font-size: 0.8125rem;
      color: var(--color-text-muted, #64748b);
    }
    .balance-card__value {
      font-size: 1.125rem;
      color: var(--color-primary-dark, #0f766e);
    }
    .preview-box {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--color-surface-highlight, #f0fdf4);
      border: 1px solid var(--color-border-success, #bbf7d0);
      border-radius: 6px;
    }
    .preview-item {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      font-size: 0.875rem;
    }
    .preview-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, #64748b);
    }
    .text-pos {
      color: #166534;
    }
    .text-neg {
      color: #991b1b;
    }
    .noop-box {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: var(--color-surface-subtle, #f8fafc);
      border: 1px solid var(--color-border, #cbd5e1);
      border-radius: 6px;
      font-size: 0.875rem;
      color: var(--color-text-secondary, #475569);
    }
    .noop-icon {
      font-weight: bold;
      color: var(--color-text-muted, #64748b);
    }
    .stale-alert-wrap {
      margin-bottom: 0.5rem;
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
      .preview-box {
        grid-template-columns: 1fr;
      }
    }
  `],
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
