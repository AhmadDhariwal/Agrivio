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
  templateUrl: './adjust-balance-dialog.component.html',
  styleUrl: './adjust-balance-dialog.component.scss',
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
