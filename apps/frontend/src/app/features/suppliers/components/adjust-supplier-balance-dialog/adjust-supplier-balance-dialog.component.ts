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
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { SupplierFinanceApi } from '../../data-access/supplier-finance.api';
import {
  SupplierBalanceAdjustmentRecord,
  SupplierBalanceType,
  SupplierRecord,
} from '../../models/suppliers.models';

function nonNegativeMoneyValidator(control: AbstractControl): ValidationErrors | null {
  const val = control.value;
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (isNaN(num) || num < 0) {
    return { invalidMoney: true };
  }
  return null;
}

export const SUPPLIER_ADJUSTMENT_CATEGORIES = [
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'correction', label: 'Balance Correction' },
  { value: 'opening_correction', label: 'Opening Correction' },
  { value: 'other', label: 'Other' },
] as const;

@Component({
  selector: 'agrivio-adjust-supplier-balance-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiDialogComponent,
    UiFieldLabelComponent,
    UiAlertComponent,
  ],
  template: `
    <agrivio-ui-dialog
      [open]="open()"
      title="Adjust Supplier Balance"
      description="Correct recorded financial position through an authoritative ledger adjustment."
      size="md"
      (dismiss)="onDismiss()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" class="adjust-form" novalidate>
        <!-- Stale Balance Conflict Alert -->
        @if (staleConflictMessage()) {
          <div class="stale-alert-wrap" data-testid="supplier-stale-conflict-alert">
            <agrivio-ui-alert tone="warning" [message]="staleConflictMessage()!" role="alert" />
          </div>
        }

        @if (errorMessage()) {
          <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
        }

        <div class="form-grid">
          <!-- Supplier Display -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Supplier" [required]="true" />
            <div class="static-box" data-testid="adjust-supplier-name">
              <strong>{{ supplierName() }}</strong>
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
                  value="supplier_payable"
                  formControlName="balanceType"
                  data-testid="balance-type-payable"
                />
                <span>Supplier Payable</span>
              </label>
              <label class="radio-label">
                <input
                  type="radio"
                  name="balanceType"
                  value="supplier_advance"
                  formControlName="balanceType"
                  data-testid="balance-type-advance"
                />
                <span>Supplier Advance</span>
              </label>
            </div>
          </div>

          <!-- Dynamic Helper Text depending on Balance Type -->
          <div class="helper-box form-field--full" data-testid="adjust-helper-box">
            <p class="helper-text">{{ currentHelperText() }}</p>
          </div>

          <!-- Current Balance Display -->
          <div class="balance-card form-field--full" data-testid="adjust-current-display">
            <span class="balance-card__label">Current Balance</span>
            <strong class="balance-card__value" data-testid="adjust-current-value">
              PKR {{ currentBalanceFormatted() }}
            </strong>
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
                <strong
                  [class.text-pos]="deltaAmount() > 0"
                  [class.text-neg]="deltaAmount() < 0"
                  data-testid="adjust-delta-value"
                >
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
            [disabled]="saving() || isNoOp() || isInvalidDesired()"
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
export class AdjustSupplierBalanceDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supplierFinanceApi = inject(SupplierFinanceApi);

  readonly open = input(false);
  readonly supplier = input<SupplierRecord | null>(null);

  readonly dismiss = output<void>();
  readonly balanceAdjusted = output<SupplierBalanceAdjustmentRecord>();
  readonly closed = output<boolean>();

  readonly categoryOptions = SUPPLIER_ADJUSTMENT_CATEGORIES;

  readonly form = this.fb.group({
    balanceType: ['supplier_payable' as SupplierBalanceType, Validators.required],
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
  readonly overriddenAuthoritativeBalance = signal<string | null>(null);

  readonly supplierName = computed(() => this.supplier()?.name ?? 'Supplier');

  readonly currentBalance = computed(() => {
    if (this.overriddenAuthoritativeBalance() !== null) {
      return this.overriddenAuthoritativeBalance()!;
    }
    const s = this.supplier();
    const type = this.formValue().balanceType;
    if (type === 'supplier_payable') {
      return s?.derivedBalances?.payable?.amount ?? '0.00';
    }
    if (type === 'supplier_advance') {
      return s?.derivedBalances?.advance?.amount ?? '0.00';
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

  readonly isInvalidDesired = computed(() => {
    if (!this.hasEnteredDesired()) return true;
    const num = Number(this.formValue().desiredBalance);
    return isNaN(num) || num < 0;
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
      case 'supplier_payable':
        return 'Use this only to correct the recorded Supplier Payable balance. If you actually paid the supplier, use Supplier Payment.';
      case 'supplier_advance':
        return 'Use this only to correct the recorded Supplier Advance. If the supplier actually returned money, use Record Refund.';
      default:
        return '';
    }
  });

  constructor() {
    this.form.valueChanges.subscribe(() => {
      this.formValue.set(this.form.getRawValue());
    });

    effect(() => {
      if (this.open()) {
        this.reset();
      }
    });

    this.form.controls.balanceType.valueChanges.subscribe(() => {
      this.overriddenAuthoritativeBalance.set(null);
      this.staleConflictMessage.set(null);
    });
  }

  private reset(): void {
    this.form.reset({
      balanceType: 'supplier_payable',
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
    this.staleConflictMessage.set(null);

    const val = this.form.getRawValue();

    if (this.form.invalid || this.isNoOp() || this.isInvalidDesired() || this.saving()) {
      return;
    }

    const expectedAmount = Number(this.currentBalance()).toFixed(2);
    const desiredAmount = Number(val.desiredBalance).toFixed(2);

    this.saving.set(true);
    const idempotencyKey = crypto.randomUUID();

    this.supplierFinanceApi
      .adjustBalance(
        {
          supplierId: s.id,
          balanceType: val.balanceType!,
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
                  val.balanceType === 'supplier_payable'
                    ? 'Supplier Payable'
                    : 'Supplier Advance';
                this.staleConflictMessage.set(
                  `The supplier balance changed since this form was opened. Current ${typeLabel} is PKR ${latest}. Review before posting the adjustment.`,
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
