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
  selector: 'agrivio-transfer-money-dialog',
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
      title="Transfer Money"
      description="Transfer funds directly between two active business accounts."
      size="md"
      (dismiss)="onDismiss()"
    >
      <form [formGroup]="form" (ngSubmit)="submit()" class="transfer-form" novalidate>
        @if (errorMessage()) {
          <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
        }

        <div class="form-grid">
          <!-- From Account -->
          <div class="form-field">
            <agrivio-ui-field-label label="From Account" [required]="true" for="transfer-from-account" />
            <agrivio-ui-searchable-dropdown
              id="transfer-from-account"
              testId="transfer-from-account"
              formControlName="fromAccountId"
              [options]="fromAccountOptions()"
              placeholder="Select source account"
              [searchable]="true"
              [clearable]="false"
              [serverSearch]="false"
            />
            @if (formSubmitAttempted() && form.controls.fromAccountId.errors?.['required']) {
              <p class="field-error" role="alert">Source account is required.</p>
            }
          </div>

          <!-- To Account -->
          <div class="form-field">
            <agrivio-ui-field-label label="To Account" [required]="true" for="transfer-to-account" />
            <agrivio-ui-searchable-dropdown
              id="transfer-to-account"
              testId="transfer-to-account"
              formControlName="toAccountId"
              [options]="toAccountOptions()"
              placeholder="Select destination account"
              [searchable]="true"
              [clearable]="false"
              [serverSearch]="false"
            />
            @if (formSubmitAttempted() && form.controls.toAccountId.errors?.['required']) {
              <p class="field-error" role="alert">Destination account is required.</p>
            }
            @if (formSubmitAttempted() && form.errors?.['sameAccount']) {
              <p class="field-error" role="alert">Source and destination accounts must differ.</p>
            }
          </div>

          <!-- Amount -->
          <div class="form-field">
            <agrivio-ui-field-label label="Amount (PKR)" [required]="true" for="transfer-amount" />
            <input
              id="transfer-amount"
              type="text"
              inputmode="decimal"
              class="ag-input"
              [class.ag-input--invalid]="formSubmitAttempted() && form.controls.amount.invalid"
              formControlName="amount"
              placeholder="0.00"
              data-testid="transfer-amount-input"
            />
            @if (formSubmitAttempted() && form.controls.amount.errors?.['required']) {
              <p class="field-error" role="alert">Amount is required.</p>
            } @else if (formSubmitAttempted() && form.controls.amount.errors?.['positiveMoney']) {
              <p class="field-error" role="alert">Amount must be greater than zero.</p>
            }
          </div>

          <!-- Date -->
          <div class="form-field">
            <agrivio-ui-field-label label="Date" for="transfer-date" />
            <input
              id="transfer-date"
              type="date"
              class="ag-input"
              formControlName="businessDate"
              data-testid="transfer-date-input"
            />
          </div>

          <!-- Reference -->
          <div class="form-field">
            <agrivio-ui-field-label label="Reference" for="transfer-reference" />
            <input
              id="transfer-reference"
              type="text"
              class="ag-input"
              formControlName="reference"
              placeholder="e.g. TR-2026-001 or Cheque #"
              data-testid="transfer-reference-input"
              maxlength="120"
            />
          </div>

          <!-- Notes -->
          <div class="form-field form-field--full">
            <agrivio-ui-field-label label="Notes" for="transfer-notes" />
            <input
              id="transfer-notes"
              type="text"
              class="ag-input"
              formControlName="notes"
              placeholder="Optional transfer remarks"
              data-testid="transfer-notes-input"
              maxlength="500"
            />
          </div>
        </div>

        <!-- Transfer Preview -->
        @if (preview(); as p) {
          <div class="transfer-preview" data-testid="transfer-preview">
            <div class="transfer-preview__title">Transfer Effect Preview</div>
            <div class="transfer-preview__grid">
              <div class="transfer-preview__leg">
                <span class="transfer-preview__label">From</span>
                <span class="transfer-preview__name">{{ p.fromName }}</span>
                <span class="transfer-preview__delta transfer-preview__delta--out">- PKR {{ p.formattedAmount }}</span>
              </div>
              <div class="transfer-preview__arrow" aria-hidden="true">→</div>
              <div class="transfer-preview__leg">
                <span class="transfer-preview__label">To</span>
                <span class="transfer-preview__name">{{ p.toName }}</span>
                <span class="transfer-preview__delta transfer-preview__delta--in">+ PKR {{ p.formattedAmount }}</span>
              </div>
            </div>
            <div class="transfer-preview__footer">
              <span>Total Liquid Funds: <strong>No change</strong></span>
              <span class="transfer-preview__neutral-badge">Balance Neutral</span>
            </div>
          </div>
        }

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
            [disabled]="submitting() || form.invalid"
            data-testid="transfer-submit-btn"
          >
            @if (submitting()) {
              <span>Posting transfer…</span>
            } @else {
              <span>Post Transfer</span>
            }
          </button>
        </div>
      </form>
    </agrivio-ui-dialog>
  `,
  styles: [`
    .transfer-form {
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
    .ag-input {
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
    .ag-input:focus {
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
    .transfer-preview {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .transfer-preview__title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
    }
    .transfer-preview__grid {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .transfer-preview__leg {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
    }
    .transfer-preview__arrow {
      font-size: 18px;
      color: #94a3b8;
      font-weight: bold;
      padding: 0 8px;
    }
    .transfer-preview__label {
      font-size: 11px;
      color: #64748b;
    }
    .transfer-preview__name {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }
    .transfer-preview__delta {
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .transfer-preview__delta--out {
      color: #dc2626;
    }
    .transfer-preview__delta--in {
      color: #059669;
    }
    .transfer-preview__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12.5px;
      color: #334155;
      padding-top: 8px;
      border-top: 1px dashed #cbd5e1;
    }
    .transfer-preview__neutral-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 9999px;
      background: #e0f2fe;
      color: #0369a1;
      font-size: 11px;
      font-weight: 600;
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
      .transfer-preview__grid {
        flex-direction: column;
        align-items: flex-start;
      }
      .transfer-preview__arrow {
        display: none;
      }
    }
  `],
})
export class TransferMoneyDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AccountsApi);

  readonly open = input(false);
  readonly accounts = input<AccountRecord[]>([]);
  readonly initialSourceAccountId = input<string | undefined>();
  readonly preselectedAccountId = input<string | undefined>();

  readonly dismiss = output<void>();
  readonly transferred = output<string>();

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  private readonly internalAccounts = signal<AccountRecord[]>([]);

  readonly effectiveAccounts = computed(() =>
    this.accounts().length > 0 ? this.accounts() : this.internalAccounts(),
  );

  readonly activeAccounts = computed(() =>
    this.effectiveAccounts().filter((a) => a.status === 'active'),
  );

  readonly fromAccountOptions = computed(() =>
    this.activeAccounts().map((a) =>
      formatAccountOption({
        id: a.id,
        name: a.name,
        type: a.accountType,
      }),
    ),
  );

  readonly form = this.fb.nonNullable.group(
    {
      fromAccountId: ['', [Validators.required]],
      toAccountId: ['', [Validators.required]],
      amount: ['', [Validators.required, positiveMoneyValidator]],
      businessDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
      reference: [''],
      notes: [''],
    },
    {
      validators: [
        (group: AbstractControl): ValidationErrors | null => {
          const from = group.get('fromAccountId')?.value;
          const to = group.get('toAccountId')?.value;
          if (from && to && from === to) {
            return { sameAccount: true };
          }
          return null;
        },
      ],
    },
  );

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly toAccountOptions = computed(() => {
    const fromId = this.formValue().fromAccountId;
    return this.activeAccounts()
      .filter((a) => a.id !== fromId)
      .map((a) =>
        formatAccountOption({
          id: a.id,
          name: a.name,
          type: a.accountType,
        }),
      );
  });

  readonly accountOptions = computed(() => this.fromAccountOptions());
  readonly isSameAccount = computed(() => {
    const val = this.formValue();
    return !!val.fromAccountId && !!val.toAccountId && val.fromAccountId === val.toAccountId;
  });

  readonly preview = computed(() => {
    const val = this.formValue();
    const fromId = val.fromAccountId;
    const toId = val.toAccountId;
    const amountVal = Number(val.amount);
    if (!fromId || !toId || fromId === toId || isNaN(amountVal) || amountVal <= 0) {
      return null;
    }
    const fromAcc = this.effectiveAccounts().find((a) => a.id === fromId);
    const toAcc = this.effectiveAccounts().find((a) => a.id === toId);
    return {
      fromName: fromAcc?.name ?? 'Source Account',
      toName: toAcc?.name ?? 'Destination Account',
      formattedAmount: amountVal.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    };
  });

  readonly canPreview = computed(() => this.preview() !== null);

  constructor() {
    effect(() => {
      if (this.open()) {
        this.errorMessage.set(null);
        this.formSubmitAttempted.set(false);
        const sourceId = this.preselectedAccountId() ?? this.initialSourceAccountId() ?? '';
        this.form.reset({
          fromAccountId: sourceId,
          toAccountId: '',
          amount: '',
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
    const payload = {
      sourceAccountId: val.fromAccountId,
      destinationAccountId: val.toAccountId,
      amount: { amount: Number(val.amount).toFixed(2), currency: 'PKR' },
      businessDate: val.businessDate || undefined,
      reference: val.reference.trim() || undefined,
      notes: val.notes.trim() || undefined,
    };

    const idempotencyKey = crypto.randomUUID();
    this.api.postTransfer(payload, idempotencyKey).subscribe({
      next: () => {
        this.submitting.set(false);
        this.transferred.emit('Transfer completed successfully.');
        this.dismiss.emit();
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to post transfer.')
            : 'Unable to post transfer.',
        );
      },
    });
  }
}
