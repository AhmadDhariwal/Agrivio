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
  templateUrl: './transfer-money-dialog.component.html',
  styleUrl: './transfer-money-dialog.component.scss',
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
