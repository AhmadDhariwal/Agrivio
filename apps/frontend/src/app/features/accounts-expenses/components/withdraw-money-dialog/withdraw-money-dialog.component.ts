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
  templateUrl: './withdraw-money-dialog.component.html',
  styleUrl: './withdraw-money-dialog.component.scss',
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
