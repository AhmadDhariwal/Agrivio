import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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

function validDecimalMoneyValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value;
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (isNaN(num) || num < 0) {
    return { invalidMoney: true };
  }
  return null;
}

export const ADJUSTMENT_CATEGORIES = [
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'cash_difference', label: 'Cash Difference' },
  { value: 'unclassified', label: 'Unclassified' },
  { value: 'other', label: 'Other' },
] as const;

@Component({
  selector: 'agrivio-adjust-balance-dialog',
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
      title="Adjust Balance"
      description="Set actual balance through an authoritative delta adjustment."
      size="md"
      (dismiss)="onDismiss()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" class="adjust-form" novalidate>
        <!-- Stale Balance Conflict Alert -->
        @if (staleConflictMessage()) {
          <div class="stale-alert-wrap" data-testid="stale-conflict-alert">
            <agrivio-ui-alert tone="warning" [message]="staleConflictMessage()!" role="alert" />
          </div>
        }

        @if (errorMessage()) {
          <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
        }

        <div class="form-grid">
          <!-- Account -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Account" [required]="true" for="adjust-account" />
            <agrivio-ui-searchable-dropdown
              id="adjust-account"
              testId="adjust-account"
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

          <!-- Current Balance Card -->
          <div class="balance-display-card" data-testid="adjust-current-balance-display">
            <span class="balance-display-card__label">Current Authoritative Balance</span>
            <span class="balance-display-card__value">PKR {{ formatMoney(currentBalance()) }}</span>
          </div>

          <!-- Actual Balance Input -->
          <div class="form-field">
            <agrivio-ui-field-label label="Actual Balance (PKR)" [required]="true" for="adjust-actual-balance" />
            <input
              id="adjust-actual-balance"
              type="text"
              inputmode="decimal"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.actualBalance.invalid"
              formControlName="actualBalance"
              placeholder="0.00"
              data-testid="adjust-actual-balance-input"
            />
            @if (formSubmitAttempted() && form.controls.actualBalance.errors?.['required']) {
              <p class="field-error" role="alert">Actual balance is required.</p>
            } @else if (formSubmitAttempted() && form.controls.actualBalance.errors?.['invalidMoney']) {
              <p class="field-error" role="alert">Actual balance must be a non-negative number.</p>
            }
          </div>

          <!-- Adjustment Preview Box -->
          <div class="adjustment-preview-box" data-testid="adjustment-preview">
            <div class="adjustment-preview-box__header">Adjustment Preview</div>
            @if (deltaPreview(); as p) {
              <div class="adjustment-preview-box__body">
                <div class="preview-row">
                  <span class="preview-row__label">Current:</span>
                  <span class="preview-row__val">PKR {{ formatMoney(p.current) }}</span>
                </div>
                <div class="preview-row">
                  <span class="preview-row__label">Actual:</span>
                  <span class="preview-row__val">PKR {{ formatMoney(p.actual) }}</span>
                </div>
                <div class="preview-row preview-row--highlight">
                  <span class="preview-row__label">Adjustment:</span>
                  <span
                    class="preview-row__delta"
                    [class.preview-row__delta--pos]="p.deltaNum > 0"
                    [class.preview-row__delta--neg]="p.deltaNum < 0"
                    [class.preview-row__delta--zero]="p.deltaNum === 0"
                    data-testid="adjustment-delta-value"
                  >
                    {{ p.deltaText }}
                  </span>
                </div>
              </div>
            } @else {
              <div class="adjustment-preview-box__empty">
                Enter an actual balance to calculate the required adjustment.
              </div>
            }
          </div>

          @if (isNoOp()) {
            <div class="noop-callout" data-testid="no-op-message">
              <span>No adjustment is required. Actual balance matches current balance.</span>
            </div>
          }

          <!-- Reason (Category) -->
          <div class="form-field">
            <agrivio-ui-field-label label="Category / Reason" [required]="true" for="adjust-category" />
            <select
              id="adjust-category"
              class="ag-select"
              formControlName="category"
              data-testid="adjust-category-select"
            >
              @for (cat of categories; track cat.value) {
                <option [value]="cat.value">{{ cat.label }}</option>
              }
            </select>
          </div>

          <!-- Date -->
          <div class="form-field">
            <agrivio-ui-field-label label="Date" for="adjust-date" />
            <input
              id="adjust-date"
              type="date"
              class="ag-input"
              formControlName="businessDate"
              data-testid="adjust-date-input"
            />
          </div>

          <!-- Reason description / explanation (Required by backend) -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Reason / Explanation" [required]="true" for="adjust-reason" />
            <input
              id="adjust-reason"
              type="text"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.reason.invalid"
              formControlName="reason"
              placeholder="e.g. Till count reconciliation or monthly statement adjustment"
              data-testid="adjust-reason-input"
              maxlength="500"
            />
            @if (formSubmitAttempted() && form.controls.reason.errors?.['required']) {
              <p class="field-error" role="alert">Reason is required for balance adjustment.</p>
            }
          </div>

          <!-- Reference -->
          <div class="form-field">
            <agrivio-ui-field-label label="Reference" for="adjust-reference" />
            <input
              id="adjust-reference"
              type="text"
              class="ag-input"
              formControlName="reference"
              placeholder="e.g. Audit Ref # or Statement #"
              data-testid="adjust-reference-input"
              maxlength="120"
            />
          </div>

          <!-- Notes -->
          <div class="form-field">
            <agrivio-ui-field-label label="Notes" for="adjust-notes" />
            <input
              id="adjust-notes"
              type="text"
              class="ag-input"
              formControlName="notes"
              placeholder="Optional remarks"
              data-testid="adjust-notes-input"
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
            [disabled]="submitting() || isNoOp()"
            data-testid="adjust-submit-btn"
          >
            @if (submitting()) {
              <span>Posting adjustment…</span>
            } @else {
              <span>Post Adjustment</span>
            }
          </button>
        </div>
      </form>
    </agrivio-ui-dialog>
  `,
  styles: [`
    .adjust-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
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
    .balance-display-card {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      justify-content: center;
    }
    .balance-display-card__label {
      font-size: 11px;
      font-weight: 500;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .balance-display-card__value {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }
    .adjustment-preview-box {
      grid-column: 1 / -1;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .adjustment-preview-box__header {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
    }
    .adjustment-preview-box__body {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .preview-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: #475569;
    }
    .preview-row--highlight {
      margin-top: 4px;
      padding-top: 6px;
      border-top: 1px dashed #cbd5e1;
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }
    .preview-row__val {
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }
    .preview-row__delta {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }
    .preview-row__delta--pos {
      color: #059669;
    }
    .preview-row__delta--neg {
      color: #dc2626;
    }
    .preview-row__delta--zero {
      color: #64748b;
    }
    .adjustment-preview-box__empty {
      font-size: 12.5px;
      color: #94a3b8;
      font-style: italic;
    }
    .noop-callout {
      grid-column: 1 / -1;
      background: #fefce8;
      border: 1px solid #fef08a;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      color: #854d0e;
      font-weight: 500;
    }
    .stale-alert-wrap {
      margin-bottom: 4px;
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
export class AdjustBalanceDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AccountsApi);

  readonly open = input(false);
  readonly accounts = input<AccountRecord[]>([]);
  readonly initialAccountId = input<string | undefined>();
  readonly preselectedAccountId = input<string | undefined>();

  readonly dismiss = output<void>();
  readonly adjusted = output<void>();
  readonly balanceAdjusted = output<string>();

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly staleConflictMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  private readonly internalAccounts = signal<AccountRecord[]>([]);

  readonly categories = ADJUSTMENT_CATEGORIES;

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
    actualBalance: ['', [Validators.required, validDecimalMoneyValidator]],
    category: ['reconciliation' as string, [Validators.required]],
    reason: ['', [Validators.required]],
    businessDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    reference: [''],
    notes: [''],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly overriddenCurrentBalance = signal<string | null>(null);

  readonly currentBalance = computed(() => {
    const overridden = this.overriddenCurrentBalance();
    if (overridden !== null) {
      return overridden;
    }
    const accId = this.formValue().accountId;
    const acc = this.effectiveAccounts().find((a) => a.id === accId);
    return acc?.derivedBalances?.balance?.amount ?? '0.00';
  });

  readonly currentBalanceAmount = computed(() => this.currentBalance());

  readonly deltaPreview = computed(() => {
    const actualStr = this.formValue().actualBalance;
    if (actualStr === null || actualStr === undefined || actualStr === '' || isNaN(Number(actualStr))) {
      return null;
    }
    const currentNum = Number(this.currentBalance());
    const actualNum = Number(actualStr);
    const delta = actualNum - currentNum;

    let deltaText: string;
    if (delta > 0) {
      deltaText = `+ PKR ${delta.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Increase)`;
    } else if (delta < 0) {
      deltaText = `- PKR ${Math.abs(delta).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Decrease)`;
    } else {
      deltaText = `PKR 0.00 (No change)`;
    }

    return {
      current: currentNum,
      actual: actualNum,
      deltaNum: delta,
      deltaText,
    };
  });

  readonly delta = computed(() => this.deltaPreview()?.deltaNum ?? 0);
  readonly formattedDelta = computed(() => this.deltaPreview()?.deltaText ?? '');

  readonly isNoOp = computed(() => {
    const preview = this.deltaPreview();
    return preview !== null && preview.deltaNum === 0;
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.errorMessage.set(null);
        this.staleConflictMessage.set(null);
        this.overriddenCurrentBalance.set(null);
        this.formSubmitAttempted.set(false);
        const preselected = this.preselectedAccountId() ?? this.initialAccountId() ?? '';
        this.form.reset({
          accountId: preselected,
          actualBalance: '',
          category: 'reconciliation',
          reason: '',
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

    // Reset overridden balance when user changes account selection
    this.form.controls.accountId.valueChanges.subscribe(() => {
      this.overriddenCurrentBalance.set(null);
      this.staleConflictMessage.set(null);
    });
  }

  formatMoney(val: string | number): string {
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  onDismiss(): void {
    if (!this.submitting()) {
      this.dismiss.emit();
    }
  }

  submit(): void {
    this.formSubmitAttempted.set(true);
    if (this.form.invalid || this.submitting() || this.isNoOp()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.staleConflictMessage.set(null);

    const val = this.form.getRawValue();
    const currentBalanceStr = Number(this.currentBalance()).toFixed(2);
    const actualBalanceStr = Number(val.actualBalance).toFixed(2);

    const payload = {
      accountId: val.accountId,
      expectedCurrentBalance: { amount: currentBalanceStr, currency: 'PKR' },
      desiredBalance: { amount: actualBalanceStr, currency: 'PKR' },
      category: val.category,
      reason: val.reason.trim(),
      reference: val.reference.trim() || undefined,
      notes: val.notes.trim() || undefined,
      businessDate: val.businessDate || undefined,
    };

    const idempotencyKey = crypto.randomUUID();
    this.api.adjustBalance(payload, idempotencyKey).subscribe({
      next: () => {
        this.submitting.set(false);
        this.adjusted.emit();
        this.balanceAdjusted.emit('Balance adjusted successfully.');
        this.dismiss.emit();
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        if (error instanceof HttpErrorResponse && error.status === 409) {
          const details = error.error?.error?.details;
          const newCurrent = details?.currentBalance?.amount;
          if (newCurrent !== undefined) {
            this.overriddenCurrentBalance.set(newCurrent);
            const msg = `The account balance changed since this form was opened. Current balance is PKR ${this.formatMoney(newCurrent)}. Review the new balance before adjusting.`;
            this.staleConflictMessage.set(msg);
            this.errorMessage.set(msg);
            return;
          }
        }
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to post balance adjustment.')
            : 'Unable to post balance adjustment.',
        );
      },
    });
  }
}
