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
  template: `
    <agrivio-ui-dialog
      [open]="open()"
      title="Record Loan Repayment"
      description="Record customer repayment against an active loan receivable."
      size="md"
      (dismiss)="onDismiss()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" class="repay-loan-form" novalidate>
        @if (errorMessage()) {
          <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
        }
        @if (conflictMessage()) {
          <agrivio-ui-alert tone="warning" [message]="conflictMessage()!" role="alert" />
        }

        <div class="helper-box">
          <svg
            class="helper-box__icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p class="helper-text">
            <strong>Note:</strong> Loan repayment reduces the selected loan balance. It is not Sales Revenue.
          </p>
        </div>

        <div class="form-grid">
          <!-- Loan Details / Selector -->
          <div class="form-field form-field--full">
            @if (!loan()) {
              <div class="loan-select-group">
                <agrivio-ui-field-label label="Select Loan to Repay" [required]="true" for="repay-loan-select" />
                @if (loanOptions().length > 0) {
                  <agrivio-ui-searchable-dropdown
                    id="repay-loan-select"
                    testId="repay-loan-select"
                    formControlName="loanId"
                    [options]="loanOptions()"
                    placeholder="Select open loan"
                    [searchable]="true"
                    [clearable]="false"
                    [serverSearch]="false"
                  />
                } @else {
                  <p class="ag-muted" data-testid="no-loans-message">No active open loans available.</p>
                }
                @if (formSubmitAttempted() && form.controls.loanId.errors?.['required']) {
                  <p class="field-error" role="alert">Please select a loan to repay.</p>
                }
              </div>
            }

            @if (activeLoan(); as targetLoan) {
              <div class="loan-card" data-testid="repay-loan-details">
                <!-- Loan Card Header -->
                <div class="loan-card__header">
                  <div class="loan-card__identity">
                    <span class="loan-card__eyebrow">
                      {{ targetLoan.reference ? 'Loan Reference' : 'Loan Identifier' }}
                    </span>
                    <div class="loan-card__title-row">
                      <strong class="loan-card__title font-mono" [title]="targetLoan.reference || targetLoan.id">
                        {{ targetLoan.reference || targetLoan.id }}
                      </strong>
                    </div>
                    @if (targetLoan.customerName) {
                      <span class="loan-card__customer">{{ targetLoan.customerName }}</span>
                    }
                  </div>
                  <div class="loan-card__status">
                    <agrivio-ui-status-badge
                      [label]="humanStatus(targetLoan.status)"
                      [tone]="statusTone(targetLoan.status)"
                    />
                  </div>
                </div>

                <!-- KPI Metric Tiles (styled matching Product Module summary tiles) -->
                <div class="loan-card__kpis">
                  <div class="loan-kpi">
                    <span class="loan-kpi__label">Principal</span>
                    <strong class="loan-kpi__val tabular-num">PKR {{ targetLoan.principal.amount }}</strong>
                  </div>
                  <div class="loan-kpi">
                    <span class="loan-kpi__label">Repaid</span>
                    <strong class="loan-kpi__val loan-kpi__val--repaid tabular-num">PKR {{ targetLoan.repaid.amount || '0.00' }}</strong>
                  </div>
                  <div class="loan-kpi loan-kpi--highlight">
                    <span class="loan-kpi__label">Outstanding</span>
                    <strong class="loan-kpi__val loan-kpi__val--outstanding tabular-num" data-testid="repay-current-outstanding">
                      PKR {{ currentOutstanding() }}
                    </strong>
                  </div>
                </div>

                <!-- Meta Footer -->
                <div class="loan-card__meta">
                  <div class="loan-meta-item">
                    <span class="loan-meta-label">Disbursed Date:</span>
                    <span class="loan-meta-val font-semibold">{{ targetLoan.businessDate }}</span>
                  </div>
                  @if (targetLoan.dueDate) {
                    <div class="loan-meta-item">
                      <span class="loan-meta-label">Due Date:</span>
                      <span class="loan-meta-val font-semibold">{{ targetLoan.dueDate }}</span>
                    </div>
                  }
                  @if (targetLoan.reference && targetLoan.id) {
                    <div class="loan-meta-item loan-meta-item--id">
                      <span class="loan-meta-label">System ID:</span>
                      <span class="loan-meta-val font-mono" [title]="targetLoan.id">{{ targetLoan.id }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Receive Into Account -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Receive Into (Account)" [required]="true" for="repay-account" />
            <agrivio-ui-searchable-dropdown
              id="repay-account"
              testId="repay-account"
              formControlName="accountId"
              [options]="accountOptions()"
              placeholder="Select cash, bank, or wallet account"
              [searchable]="true"
              [clearable]="false"
              [serverSearch]="false"
            />
            @if (formSubmitAttempted() && form.controls.accountId.errors?.['required']) {
              <p class="field-error" role="alert">Receiving account is required.</p>
            }
          </div>

          <!-- Repayment Amount -->
          <div class="form-field">
            <agrivio-ui-field-label label="Repayment Amount (PKR)" [required]="true" for="repay-amount" />
            <input
              id="repay-amount"
              type="text"
              inputmode="decimal"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && (form.controls.amount.invalid || isOverpayment())"
              formControlName="amount"
              placeholder="0.00"
              data-testid="repay-amount-input"
            />
            @if (formSubmitAttempted() && form.controls.amount.errors?.['required']) {
              <p class="field-error" role="alert">Repayment amount is required.</p>
            } @else if (formSubmitAttempted() && form.controls.amount.errors?.['positiveMoney']) {
              <p class="field-error" role="alert">Amount must be greater than zero.</p>
            } @else if (formSubmitAttempted() && isOverpayment()) {
              <p class="field-error" role="alert" data-testid="overpayment-error">
                Repayment exceeds loan outstanding (PKR {{ currentOutstanding() }}).
              </p>
            }
          </div>

          <!-- Business Date -->
          <div class="form-field">
            <agrivio-ui-field-label label="Business Date" [required]="true" for="repay-business-date" />
            <input
              id="repay-business-date"
              type="date"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.businessDate.invalid"
              formControlName="businessDate"
              data-testid="repay-business-date-input"
            />
            @if (formSubmitAttempted() && form.controls.businessDate.errors?.['required']) {
              <p class="field-error" role="alert">Business date is required.</p>
            }
          </div>

          <!-- Reference (Optional) -->
          <div class="form-field">
            <agrivio-ui-field-label label="Reference (Optional)" [required]="false" for="repay-reference" />
            <input
              id="repay-reference"
              type="text"
              class="ag-input"
              formControlName="reference"
              placeholder="e.g. REP-2026-001"
              maxlength="160"
              data-testid="repay-reference-input"
            />
          </div>

          <!-- Notes (Optional) -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Notes (Optional)" [required]="false" for="repay-notes" />
            <textarea
              id="repay-notes"
              class="ag-input"
              formControlName="notes"
              placeholder="Optional repayment notes"
              rows="2"
              maxlength="1000"
              data-testid="repay-notes-input"
            ></textarea>
          </div>
        </div>

        <!-- Summary Preview Box -->
        @if (hasPreview()) {
          <div class="preview-box" data-testid="repay-summary-preview">
            <div class="preview-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <h4 class="preview-title">Repayment Impact Preview</h4>
            </div>
            <div class="preview-grid">
              <div class="preview-item">
                <span class="preview-label">Loan Receivable</span>
                <strong class="preview-val preview-val--neg tabular-num">- PKR {{ formattedAmount() }}</strong>
              </div>
              <div class="preview-item">
                <span class="preview-label">{{ selectedAccountName() }}</span>
                <strong class="preview-val preview-val--pos tabular-num">+ PKR {{ formattedAmount() }}</strong>
              </div>
              <div class="preview-item">
                <span class="preview-label">Remaining Outstanding</span>
                <strong class="preview-val tabular-num">{{ formatRemaining() }}</strong>
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
            data-testid="repay-cancel-btn"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="ag-btn ag-btn--primary"
            [disabled]="saving() || isOverpayment()"
            data-testid="repay-submit-btn"
          >
            {{ saving() ? 'Recording…' : 'Record Repayment' }}
          </button>
        </div>
      </form>
    </agrivio-ui-dialog>
  `,
  styles: [`
    .repay-loan-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .helper-box {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      background: var(--ag-color-bg-accent, #f1f5f9);
      border: 1px solid var(--ag-color-border, #e2e8f0);
      border-radius: var(--ag-radius-md, 6px);
      padding: 0.5rem 0.75rem;
    }
    .helper-box__icon {
      flex-shrink: 0;
      color: var(--ag-color-primary, #065f46);
      margin-top: 0.125rem;
    }
    .helper-text {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.4;
      color: var(--ag-color-text-muted, #475569);
    }
    .helper-text strong {
      color: var(--ag-color-text, #0f172a);
    }
    .loan-select-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-bottom: 0.375rem;
    }
    .loan-card {
      background: var(--ag-color-surface, #ffffff);
      border: 1px solid var(--ag-color-border, #e2e8f0);
      border-radius: var(--ag-radius-lg, 8px);
      box-shadow: var(--ag-shadow-sm, 0 1px 2px rgba(15, 23, 42, 0.04));
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .loan-card__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.5rem 0.875rem;
      background: var(--ag-color-bg, #f8fafc);
      border-bottom: 1px solid var(--ag-color-border, #e2e8f0);
    }
    .loan-card__identity {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
      flex: 1;
    }
    .loan-card__eyebrow {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ag-color-primary, #065f46);
    }
    .loan-card__title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .loan-card__title {
      font-size: 0.875rem;
      font-weight: 700;
      color: var(--ag-color-text, #0f172a);
      word-break: break-all;
      overflow-wrap: anywhere;
      line-height: 1.25;
    }
    .loan-card__customer {
      font-size: 0.75rem;
      color: var(--ag-color-text-muted, #64748b);
      font-weight: 500;
    }
    .loan-card__status {
      flex-shrink: 0;
    }
    .loan-card__kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.5rem;
      padding: 0.5rem 0.875rem;
      background: var(--ag-color-surface, #ffffff);
    }
    .loan-kpi {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      padding: 0.375rem 0.5rem;
      background: var(--ag-color-bg, #f8fafc);
      border: 1px solid var(--ag-color-border, #e2e8f0);
      border-radius: var(--ag-radius-md, 6px);
      min-width: 0;
    }
    .loan-kpi--highlight {
      background: var(--ag-color-primary-muted, #ecfdf5);
      border-color: color-mix(in srgb, var(--ag-color-primary) 30%, white);
    }
    .loan-kpi__label {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ag-color-text-muted, #64748b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .loan-kpi__val {
      font-size: 0.875rem;
      font-weight: 700;
      color: var(--ag-color-text, #0f172a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .loan-kpi__val--repaid {
      color: var(--ag-color-success, #1f7a45);
    }
    .loan-kpi__val--outstanding {
      color: var(--ag-color-primary, #065f46);
    }
    .loan-card__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      padding: 0.375rem 0.875rem;
      background: var(--ag-color-bg, #f8fafc);
      border-top: 1px solid var(--ag-color-border, #e2e8f0);
      font-size: 0.75rem;
    }
    .loan-meta-item {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      color: var(--ag-color-text-muted, #64748b);
      min-width: 0;
    }
    .loan-meta-item--id {
      max-width: 100%;
    }
    .loan-meta-label {
      font-weight: 500;
    }
    .loan-meta-val {
      color: var(--ag-color-text, #0f172a);
      word-break: break-all;
      overflow-wrap: anywhere;
    }
    .font-mono {
      font-family: var(--ag-font-mono, monospace);
    }
    .tabular-num {
      font-variant-numeric: tabular-nums;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.875rem;
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: 0.3125rem;
    }
    .form-field--full {
      grid-column: span 2;
    }
    .preview-box {
      background: var(--ag-color-surface, #ffffff);
      border: 1px solid var(--ag-color-border, #e2e8f0);
      border-radius: var(--ag-radius-md, 6px);
      padding: 0.875rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      box-shadow: var(--ag-shadow-sm, 0 1px 2px rgba(15, 23, 42, 0.04));
    }
    .preview-header {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      color: var(--ag-color-primary, #065f46);
    }
    .preview-title {
      margin: 0;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ag-color-primary, #065f46);
    }
    .preview-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.625rem;
    }
    .preview-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.5rem 0.625rem;
      background: var(--ag-color-bg, #f8fafc);
      border: 1px solid var(--ag-color-border, #e2e8f0);
      border-radius: var(--ag-radius-md, 6px);
      min-width: 0;
    }
    .preview-label {
      font-size: 0.6875rem;
      font-weight: 600;
      color: var(--ag-color-text-muted, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .preview-val {
      font-size: 0.9375rem;
      font-weight: 700;
      color: var(--ag-color-text, #0f172a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .preview-val--pos {
      color: var(--ag-color-success, #1f7a45);
    }
    .preview-val--neg {
      color: var(--ag-color-danger, #b42318);
    }
    .field-error {
      margin: 0;
      font-size: 0.75rem;
      color: var(--ag-color-danger, #dc2626);
      font-weight: 500;
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
      .loan-card__kpis,
      .preview-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
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
