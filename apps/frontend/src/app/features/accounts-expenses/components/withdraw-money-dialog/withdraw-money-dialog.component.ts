import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UiDialogComponent } from '../../../../shared/ui/ui-dialog/ui-dialog.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiSearchableDropdownComponent } from '../../../../shared/ui/ui-searchable-dropdown/ui-searchable-dropdown.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { formatAccountOption } from '../../../../shared/ui/ui-searchable-dropdown/entity-dropdown-formatters';
import { AccountRecord } from '../../models/accounts.models';
import { AccountsApi } from '../../data-access/accounts.api';

function positiveMoneyValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value;
  if (!val) return null;
  const num = Number(val);
  if (isNaN(num) || num <= 0) {
    return { positiveMoney: true };
  }
  return null;
}

export const OUTFLOW_CATEGORIES = [
  { value: 'unclassified', label: 'Unclassified' },
  { value: 'owner_withdrawal', label: 'Owner Withdrawal' },
  { value: 'external_payment', label: 'External Payment' },
  { value: 'cash_difference', label: 'Cash Difference' },
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'other', label: 'Other' },
] as const;

@Component({
  selector: 'agrivio-withdraw-money-dialog',
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
      title="Withdraw Money"
      description="Record an external withdrawal or outflow from an account."
      size="md"
      (dismiss)="onDismiss()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" class="money-flow-form" novalidate>
        <!-- Explanatory helper box -->
        <div class="helper-callout" data-testid="withdraw-money-helper">
          <p class="helper-text">
            Use this for money leaving an account outside existing Supplier Payment, Expense, or other Agrivio workflows.
          </p>
        </div>

        @if (errorMessage()) {
          <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
        }

        <div class="form-grid">
          <!-- Account -->
          <div class="form-field">
            <agrivio-ui-field-label label="Account" [required]="true" for="withdraw-money-account" />
            <agrivio-ui-searchable-dropdown
              id="withdraw-money-account"
              testId="withdraw-money-account"
              formControlName="accountId"
              [options]="accountOptions()"
              placeholder="Select account"
              [searchable]="true"
              [clearable]="false"
              [serverSearch]="false"
            />
            @if (formSubmitAttempted() && form.controls.accountId.errors?.['required']) {
              <p class="field-error" role="alert">Account is required.</p>
            }
          </div>

          <!-- Amount -->
          <div class="form-field">
            <agrivio-ui-field-label label="Amount (PKR)" [required]="true" for="withdraw-money-amount" />
            <input
              id="withdraw-money-amount"
              type="text"
              inputmode="decimal"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.amount.invalid"
              formControlName="amount"
              placeholder="0.00"
              data-testid="withdraw-money-amount-input"
            />
            @if (formSubmitAttempted() && form.controls.amount.errors?.['required']) {
              <p class="field-error" role="alert">Amount is required.</p>
            } @else if (formSubmitAttempted() && form.controls.amount.errors?.['positiveMoney']) {
              <p class="field-error" role="alert">Amount must be greater than zero.</p>
            }
          </div>

          <!-- Reason (Category) -->
          <div class="form-field">
            <agrivio-ui-field-label label="Reason" [required]="true" for="withdraw-money-category" />
            <select
              id="withdraw-money-category"
              class="ag-select"
              formControlName="category"
              data-testid="withdraw-money-category-select"
            >
              @for (cat of categories; track cat.value) {
                <option [value]="cat.value">{{ cat.label }}</option>
              }
            </select>
          </div>

          <!-- Date -->
          <div class="form-field">
            <agrivio-ui-field-label label="Date" for="withdraw-money-date" />
            <input
              id="withdraw-money-date"
              type="date"
              class="ag-input"
              formControlName="businessDate"
              data-testid="withdraw-money-date-input"
            />
          </div>

          <!-- Purpose / Description -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Purpose / Description" for="withdraw-money-purpose" />
            <input
              id="withdraw-money-purpose"
              type="text"
              class="ag-input"
              formControlName="purpose"
              placeholder="e.g. Owner drawings or miscellaneous payment"
              data-testid="withdraw-money-purpose-input"
              maxlength="500"
            />
          </div>

          <!-- Reference -->
          <div class="form-field">
            <agrivio-ui-field-label label="Reference" for="withdraw-money-reference" />
            <input
              id="withdraw-money-reference"
              type="text"
              class="ag-input"
              formControlName="reference"
              placeholder="e.g. Voucher # or Cheque #"
              data-testid="withdraw-money-reference-input"
              maxlength="120"
            />
          </div>

          <!-- Notes -->
          <div class="form-field">
            <agrivio-ui-field-label label="Notes" for="withdraw-money-notes" />
            <input
              id="withdraw-money-notes"
              type="text"
              class="ag-input"
              formControlName="notes"
              placeholder="Optional remarks"
              data-testid="withdraw-money-notes-input"
              maxlength="500"
            />
          </div>
        </div>

        <div dialog-actions class="dialog-actions">
          <button
            type="button"
            class="ag-btn ag-btn--secondary"
            (click)="onDismiss()"
            [disabled]="submitting()"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="ag-btn ag-btn--primary"
            [disabled]="submitting()"
            data-testid="withdraw-money-submit-btn"
          >
            @if (submitting()) {
              <span>Withdrawing money…</span>
            } @else {
              <span>Withdraw Money</span>
            }
          </button>
        </div>
      </form>
    </agrivio-ui-dialog>
  `,
  styles: [`
    .money-flow-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .helper-callout {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .helper-text {
      margin: 0;
      font-size: 13px;
      line-height: 1.45;
      color: #1e40af;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .form-field--full {
      grid-column: 1 / -1;
    }
    .ag-input, .ag-select {
      height: 38px;
      padding: 0 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13.5px;
      color: #0f172a;
      background: #ffffff;
      outline: none;
      font-family: inherit;
      box-sizing: border-box;
      width: 100%;
    }
    .ag-input:focus, .ag-select:focus {
      border-color: #065f46;
      box-shadow: 0 0 0 1px #065f46;
    }
    .ag-input--invalid {
      border-color: #dc2626 !important;
    }
    .field-error {
      font-size: 12px;
      color: #dc2626;
      margin: 2px 0 0 0;
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    @media (max-width: 600px) {
      .form-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class WithdrawMoneyDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AccountsApi);

  readonly open = input(false);
  readonly accounts = input<AccountRecord[]>([]);
  readonly initialAccountId = input<string | undefined>();
  readonly preselectedAccountId = input<string | undefined>();

  readonly dismiss = output<void>();
  readonly saved = output<void>();
  readonly moneyWithdrawn = output<string>();

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  private readonly internalAccounts = signal<AccountRecord[]>([]);

  readonly categories = OUTFLOW_CATEGORIES;

  readonly effectiveAccounts = computed(() =>
    this.accounts().length > 0 ? this.accounts() : this.internalAccounts(),
  );

  readonly activeAccounts = computed(() =>
    this.effectiveAccounts().filter((a) => a.status === 'active'),
  );

  readonly accountOptions = computed(() =>
    this.activeAccounts().map((a) =>
      formatAccountOption({
        id: a.id,
        name: a.name,
        type: a.accountType,
      }),
    ),
  );

  readonly form = this.fb.nonNullable.group({
    accountId: ['', [Validators.required]],
    amount: ['', [Validators.required, positiveMoneyValidator]],
    category: ['unclassified' as string, [Validators.required]],
    purpose: [''],
    businessDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    reference: [''],
    notes: [''],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.errorMessage.set(null);
        this.formSubmitAttempted.set(false);
        const preselected = this.preselectedAccountId() ?? this.initialAccountId() ?? '';
        this.form.reset({
          accountId: preselected,
          amount: '',
          category: 'unclassified',
          purpose: '',
          businessDate: new Date().toISOString().slice(0, 10),
          reference: '',
          notes: '',
        });
        if (this.accounts().length === 0) {
          this.api.listAccounts({ pageSize: 200, status: 'active' }).subscribe({
            next: (res) => this.internalAccounts.set(res.items),
          });
        }
      }
    });
  }

  onDismiss(): void {
    if (!this.submitting()) {
      this.dismiss.emit();
    }
  }

  submit(): void {
    this.formSubmitAttempted.set(true);
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);

    const val = this.form.getRawValue();
    const catObj = this.categories.find((c) => c.value === val.category);
    const purposeText = val.purpose.trim() || catObj?.label || 'External money withdrawn';

    const payload = {
      accountId: val.accountId,
      direction: 'outflow' as const,
      amount: { amount: Number(val.amount).toFixed(2), currency: 'PKR' },
      category: val.category,
      purpose: purposeText,
      businessDate: val.businessDate || undefined,
      reference: val.reference.trim() || undefined,
      notes: val.notes.trim() || undefined,
    };

    const idempotencyKey = crypto.randomUUID();
    this.api.postManualTransaction(payload, idempotencyKey).subscribe({
      next: () => {
        this.submitting.set(false);
        this.saved.emit();
        this.moneyWithdrawn.emit('Money withdrawn successfully.');
        this.dismiss.emit();
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to record withdrawal.')
            : 'Unable to record withdrawal.',
        );
      },
    });
  }
}
