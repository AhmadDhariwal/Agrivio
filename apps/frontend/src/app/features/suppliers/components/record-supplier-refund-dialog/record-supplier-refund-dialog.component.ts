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
  template: `
    <agrivio-ui-dialog
      [open]="open()"
      title="Record Supplier Refund"
      description="Record a cash, bank, or wallet refund returned from available supplier advance."
      size="md"
      (dismiss)="onDismiss()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" class="refund-form" novalidate>
        @if (errorMessage()) {
          <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
        }

        <div class="helper-box" data-testid="refund-helper-box">
          <p class="helper-text">
            Use this when the supplier actually returns money held as Supplier Advance. It is not Revenue.
          </p>
        </div>

        <div class="form-grid">
          <!-- Supplier (Preselected) -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Supplier" [required]="true" />
            <div class="static-box" data-testid="refund-supplier-name">
              <strong>{{ supplierName() }}</strong>
            </div>
          </div>

          <!-- Available Supplier Advance Card -->
          <div class="balance-card form-field--full" data-testid="refund-available-advance-card">
            <span class="balance-card__label">Available Supplier Advance</span>
            <strong class="balance-card__value" data-testid="refund-available-advance-value">
              PKR {{ availableAdvanceFormatted() }}
            </strong>
          </div>

          <!-- Receive Into Account -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Receive Into (Cash / Bank / Wallet)" [required]="true" for="refund-account" />
            <agrivio-ui-searchable-dropdown
              id="refund-account"
              testId="refund-account-select"
              formControlName="accountId"
              [options]="accountOptions()"
              placeholder="Select receiving account"
              [searchable]="true"
              [clearable]="false"
              [serverSearch]="false"
            />
            @if (formSubmitAttempted() && form.controls.accountId.errors?.['required']) {
              <p class="field-error" role="alert">Receiving account is required.</p>
            }
          </div>

          <!-- Refund Amount -->
          <div class="form-field">
            <agrivio-ui-field-label label="Refund Amount (PKR)" [required]="true" for="refund-amount" />
            <input
              id="refund-amount"
              type="text"
              inputmode="decimal"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && (form.controls.amount.invalid || exceedsAdvance())"
              formControlName="amount"
              placeholder="0.00"
              data-testid="refund-amount-input"
            />
            @if (formSubmitAttempted() && form.controls.amount.errors?.['required']) {
              <p class="field-error" role="alert">Refund amount is required.</p>
            } @else if (formSubmitAttempted() && form.controls.amount.errors?.['positiveMoney']) {
              <p class="field-error" role="alert">Amount must be greater than zero.</p>
            } @else if (exceedsAdvance()) {
              <p class="field-error" role="alert" data-testid="refund-exceeds-advance-error">
                Refund amount cannot exceed available Supplier Advance (PKR {{ availableAdvanceFormatted() }}).
              </p>
            }
          </div>

          <!-- Business Date -->
          <div class="form-field">
            <agrivio-ui-field-label label="Business Date" [required]="true" for="refund-business-date" />
            <input
              id="refund-business-date"
              type="date"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.businessDate.invalid"
              formControlName="businessDate"
              data-testid="refund-business-date-input"
            />
            @if (formSubmitAttempted() && form.controls.businessDate.errors?.['required']) {
              <p class="field-error" role="alert">Business date is required.</p>
            }
          </div>

          <!-- Reference (Optional) -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Reference (Optional)" [required]="false" for="refund-reference" />
            <input
              id="refund-reference"
              type="text"
              class="ag-input"
              formControlName="reference"
              placeholder="e.g. REF-2026-001"
              maxlength="160"
              data-testid="refund-reference-input"
            />
          </div>

          <!-- Notes (Optional) -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Notes (Optional)" [required]="false" for="refund-notes" />
            <textarea
              id="refund-notes"
              class="ag-input"
              formControlName="notes"
              placeholder="Optional notes regarding the supplier refund"
              rows="2"
              maxlength="1000"
              data-testid="refund-notes-input"
            ></textarea>
          </div>
        </div>

        <!-- Preview Box -->
        @if (hasPreview()) {
          <div class="preview-box" data-testid="refund-summary-preview">
            <h4 class="preview-title">Refund Preview</h4>
            <div class="preview-grid">
              <div class="preview-item">
                <span class="preview-label">Supplier Advance</span>
                <strong class="preview-val preview-val--neg" data-testid="preview-advance-delta">
                  - PKR {{ formattedAmount() }}
                </strong>
              </div>
              <div class="preview-item">
                <span class="preview-label">{{ selectedAccountName() }}</span>
                <strong class="preview-val preview-val--pos" data-testid="preview-account-delta">
                  + PKR {{ formattedAmount() }}
                </strong>
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
            data-testid="refund-cancel-btn"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="ag-btn ag-btn--primary"
            [disabled]="saving() || exceedsAdvance() || isInvalidAmount()"
            data-testid="refund-submit-btn"
          >
            {{ saving() ? 'Recording…' : 'Record Supplier Refund' }}
          </button>
        </div>
      </form>
    </agrivio-ui-dialog>
  `,
  styles: [`
    .refund-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
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
      color: var(--color-success-dark, #15803d);
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
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
      .preview-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
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
