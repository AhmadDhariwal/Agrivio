import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, UpperCasePipe, TitleCasePipe } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import {
  UiStatusBadgeComponent,
  UiBadgeTone,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import {
  fieldValidationMessage,
  hasRequiredValidator,
  setRequiredValidator,
} from '../../../../shared/form/form-field.util';
import { AccountMovementRecord, AccountRecord } from '../../models/accounts.models';
import { forkJoin, of } from 'rxjs';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';

const MAX_NAME = 160;
const MAX_BANK = 120;
const MAX_MASKED = 64;
const MAX_WALLET = 64;
const ACCOUNT_TYPES = ['cash', 'bank', 'jazzcash', 'easypaisa'] as const;

@Component({
  selector: 'agrivio-account-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    UpperCasePipe,
    TitleCasePipe,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
    UiStatusBadgeComponent,
    UiPaginationComponent,
  ],
  templateUrl: './account-form.page.html',
  styleUrl: './account-form.page.scss',
})
export class AccountFormPage {
  private readonly api = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  readonly isActivityMode = this.route.snapshot.routeConfig?.path === 'accounts/:id/activity';
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly accountId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly postingOpening = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  readonly openingPosted = signal(false);
  readonly derivedBalance = signal<string | null>(null);
  readonly movements = signal<AccountMovementRecord[]>([]);
  readonly movementsPage = signal(1);
  readonly movementsPageSize = signal(25);
  readonly movementsTotal = signal(0);

  readonly canUseAccounts = computed(
    () => this.capabilityService?.canUseModule('accounts') ?? true,
  );
  readonly canManage = computed(
    () => this.sessionStore.hasPermission('accounts.manage') && this.canUseAccounts(),
  );
  readonly canView = computed(
    () => this.sessionStore.hasPermission('accounts.view') && this.canUseAccounts(),
  );
  readonly canCreate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('accounts.actions.create') ?? true),
  );
  readonly canInspect = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('accounts.actions.inspect') ?? true),
  );
  readonly canEdit = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('accounts.actions.edit') ?? true),
  );
  readonly canPostOpening = computed(
    () =>
      this.sessionStore.hasPermission('accounts.opening-balance.post') &&
      this.canUseAccounts() &&
      (this.capabilityService?.canPerformAction('accounts.actions.postOpeningBalance') ?? true),
  );
  readonly canPostTransaction = computed(
    () =>
      this.sessionStore.hasPermission('accounts.transaction.post') &&
      this.canUseAccounts() &&
      (this.capabilityService?.canPerformAction('accounts.actions.postManualMovement') ?? true),
  );
  readonly canCorrectTransaction = computed(
    () =>
      this.sessionStore.hasPermission('accounts.transaction.correct') &&
      this.canUseAccounts() &&
      (this.capabilityService?.canPerformAction('accounts.actions.reverseMovement') ?? true),
  );
  readonly canTransfer = computed(
    () =>
      this.sessionStore.hasPermission('accounts.transfer') &&
      this.canUseAccounts() &&
      (this.capabilityService?.canPerformAction('accounts.actions.transfer') ?? true),
  );
  readonly canReverseTransfer = computed(
    () =>
      this.sessionStore.hasPermission('accounts.transfer.reverse') &&
      this.canUseAccounts() &&
      (this.capabilityService?.canPerformAction('accounts.actions.reverseTransfer') ?? true),
  );

  // Features
  readonly showMovementHistory = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canUseView('accounts.features.movementHistory') ?? true),
  );

  // Fields
  readonly showName = computed(
    () => this.capabilityService?.canViewField('accounts.fields.name') ?? true,
  );
  readonly canEditName = computed(
    () =>
      (this.accountId() ? this.canEdit() : this.canCreate()) &&
      (this.capabilityService?.canEditField('accounts.fields.name') ?? true),
  );
  readonly showAccountType = computed(
    () => this.capabilityService?.canViewField('accounts.fields.accountType') ?? true,
  );
  readonly canEditAccountType = computed(() => !this.accountId() && this.canCreate());
  readonly showStatus = computed(
    () => this.capabilityService?.canViewField('accounts.fields.status') ?? true,
  );
  readonly canEditStatus = computed(
    () =>
      this.canEdit() && (this.capabilityService?.canEditField('accounts.fields.status') ?? true),
  );
  readonly canSave = computed(() => {
    const allowed = this.accountId() === null ? this.canCreate() : this.canEdit();
    return allowed && this.form.valid && !this.saving();
  });
  readonly showDerivedBalance = computed(
    () => this.capabilityService?.canViewField('accounts.fields.derivedBalance') ?? true,
  );
  readonly showBankName = computed(
    () => this.capabilityService?.canViewField('accounts.fields.bankName') ?? true,
  );
  readonly canEditBankName = computed(
    () =>
      (this.accountId() ? this.canEdit() : this.canCreate()) &&
      (this.capabilityService?.canEditField('accounts.fields.bankName') ?? true),
  );
  readonly showAccountNumberMasked = computed(
    () => this.capabilityService?.canViewField('accounts.fields.accountNumberMasked') ?? true,
  );
  readonly canEditAccountNumberMasked = computed(
    () =>
      (this.accountId() ? this.canEdit() : this.canCreate()) &&
      (this.capabilityService?.canEditField('accounts.fields.accountNumberMasked') ?? true),
  );
  readonly showWalletIdentifier = computed(
    () => this.capabilityService?.canViewField('accounts.fields.walletIdentifier') ?? true,
  );
  readonly canEditWalletIdentifier = computed(
    () =>
      (this.accountId() ? this.canEdit() : this.canCreate()) &&
      (this.capabilityService?.canEditField('accounts.fields.walletIdentifier') ?? true),
  );
  readonly showOpeningBalance = computed(
    () => this.capabilityService?.canViewField('accounts.fields.openingBalance') ?? true,
  );
  readonly accountType = signal('cash');
  readonly destinationAccounts = signal<AccountRecord[]>([]);
  readonly postingTransaction = signal(false);
  readonly postingTransfer = signal(false);
  readonly reversing = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly reverseTarget = signal<{ kind: 'transaction' | 'transfer'; id: string } | null>(null);
  private version = 1;

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly form = this.formBuilder.nonNullable.group({
    accountType: ['cash' as string, [Validators.required, this.accountTypeValidator.bind(this)]],
    name: ['', [Validators.required, Validators.maxLength(MAX_NAME)]],
    bankName: ['', [Validators.maxLength(MAX_BANK)]],
    accountNumberMasked: ['', [Validators.maxLength(MAX_MASKED)]],
    walletIdentifier: ['', [Validators.maxLength(MAX_WALLET)]],
    status: ['active'],
  });

  readonly openingForm = this.formBuilder.nonNullable.group({
    amount: ['', [Validators.required]],
  });

  readonly transactionForm = this.formBuilder.nonNullable.group({
    direction: ['inflow' as 'inflow' | 'outflow', [Validators.required]],
    amount: ['', [Validators.required]],
    purpose: ['', [Validators.required]],
    reference: [''],
  });

  readonly transferForm = this.formBuilder.nonNullable.group({
    destinationAccountId: ['', [Validators.required]],
    amount: ['', [Validators.required]],
    purpose: [''],
    reference: [''],
  });

  readonly reverseForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required]],
  });

  constructor() {
    this.form.controls.accountType.valueChanges.subscribe((value) => {
      this.accountType.set(value);
      this.syncAccountTypeValidators(value);
    });
    this.syncAccountTypeValidators(this.form.controls.accountType.value);

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.accountId.set(id);
      this.loading.set(true);
      forkJoin({
        account: this.api.getAccount(id),
        movements: this.canView()
          ? this.api.listMovements(id)
          : of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
        accounts: this.api.listAccountOptions(),
      }).subscribe({
        next: ({ account, movements, accounts }) => {
          this.applyAccount(account);
          this.movements.set(movements.items);
          this.movementsTotal.set(movements.meta.total);
          this.destinationAccounts.set(
            accounts.filter((item) => item.id !== id && item.status === 'active'),
          );
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load account.'));
        },
      });
    }
  }

  save(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    const allowed = this.accountId() === null ? this.canCreate() : this.canEdit();
    if (!allowed || this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.form.getRawValue();

    if (this.accountId() === null) {
      this.api
        .createAccount({
          name: value.name.trim(),
          accountType: value.accountType,
          ...this.buildTypeSpecificCreateFields(value),
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            void this.router.navigateByUrl('/app/accounts');
          },
          error: (error: unknown) => {
            this.saving.set(false);
            this.errorMessage.set(this.mapError(error, 'Unable to save account.'));
          },
        });
      return;
    }

    const id = this.accountId();
    if (!id) return;

    this.api
      .updateAccount(id, {
        expectedVersion: this.version,
        ...this.buildAccountPatchPayload(value),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          void this.router.navigateByUrl('/app/accounts');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to save account.'));
        },
      });
  }

  postOpening(): void {
    const id = this.accountId();
    if (!id || !this.canPostOpening() || this.openingForm.invalid || this.openingPosted()) {
      this.openingForm.markAllAsTouched();
      return;
    }
    this.postingOpening.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.openingForm.getRawValue();
    this.api
      .postOpeningBalance(
        id,
        { amount: { amount: value.amount.trim(), currency: 'PKR' } },
        crypto.randomUUID(),
      )
      .subscribe({
        next: (account) => {
          this.postingOpening.set(false);
          this.applyAccount(account);
          this.loadMovements();
        },
        error: (error: unknown) => {
          this.postingOpening.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post opening balance.'));
        },
      });
  }

  postTransaction(): void {
    const id = this.accountId();
    if (!id || !this.canPostTransaction() || this.transactionForm.invalid) {
      this.transactionForm.markAllAsTouched();
      return;
    }
    this.postingTransaction.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.transactionForm.getRawValue();
    this.api
      .postManualTransaction(
        {
          accountId: id,
          direction: value.direction,
          amount: { amount: value.amount.trim(), currency: 'PKR' },
          purpose: value.purpose.trim(),
          ...(value.reference.trim() === '' ? {} : { reference: value.reference.trim() }),
        },
        crypto.randomUUID(),
      )
      .subscribe({
        next: () => {
          this.postingTransaction.set(false);
          this.successMessage.set(
            value.direction === 'inflow' ? 'Manual inflow posted.' : 'Manual outflow posted.',
          );
          this.transactionForm.reset({
            direction: 'inflow',
            amount: '',
            purpose: '',
            reference: '',
          });
          this.reloadAccountState(id);
        },
        error: (error: unknown) => {
          this.postingTransaction.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post account transaction.'));
        },
      });
  }

  postTransfer(): void {
    const id = this.accountId();
    if (!id || !this.canTransfer() || this.transferForm.invalid) {
      this.transferForm.markAllAsTouched();
      return;
    }
    this.postingTransfer.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.transferForm.getRawValue();
    this.api
      .postTransfer(
        {
          sourceAccountId: id,
          destinationAccountId: value.destinationAccountId,
          amount: { amount: value.amount.trim(), currency: 'PKR' },
          ...(value.purpose.trim() === '' ? {} : { purpose: value.purpose.trim() }),
          ...(value.reference.trim() === '' ? {} : { reference: value.reference.trim() }),
        },
        crypto.randomUUID(),
      )
      .subscribe({
        next: () => {
          this.postingTransfer.set(false);
          this.successMessage.set('Transfer posted to both accounts.');
          this.transferForm.reset({
            destinationAccountId: '',
            amount: '',
            purpose: '',
            reference: '',
          });
          this.reloadAccountState(id);
        },
        error: (error: unknown) => {
          this.postingTransfer.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post account transfer.'));
        },
      });
  }

  startReverse(kind: 'transaction' | 'transfer', id: string): void {
    this.reverseTarget.set({ kind, id });
    this.reverseForm.reset({ reason: '' });
  }

  confirmReverse(): void {
    const accountId = this.accountId();
    const target = this.reverseTarget();
    if (!accountId || !target || this.reverseForm.invalid) {
      this.reverseForm.markAllAsTouched();
      return;
    }
    this.reversing.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const reason = this.reverseForm.getRawValue().reason.trim();
    const key = crypto.randomUUID();
    const onSuccess = (): void => {
      this.reversing.set(false);
      this.reverseTarget.set(null);
      this.successMessage.set(
        target.kind === 'transfer'
          ? 'Transfer reversed on both accounts. Original movements are preserved.'
          : 'Transaction reversed. Original movement is preserved.',
      );
      this.reloadAccountState(accountId);
    };
    const onError = (error: unknown): void => {
      this.reversing.set(false);
      this.errorMessage.set(this.mapError(error, 'Unable to reverse the posted movement.'));
    };
    if (target.kind === 'transaction') {
      this.api.reverseManualTransaction(target.id, { reason }, key).subscribe({
        next: onSuccess,
        error: onError,
      });
      return;
    }
    this.api.reverseTransfer(target.id, { reason }, key).subscribe({
      next: onSuccess,
      error: onError,
    });
  }

  isReversed(item: AccountMovementRecord): boolean {
    return this.movements().some((candidate) => candidate.reversalOfId === item.id);
  }

  canReverseManual(item: AccountMovementRecord): boolean {
    return (
      this.canCorrectTransaction() &&
      (item.sourceType === 'manual_inflow' || item.sourceType === 'manual_outflow') &&
      !this.isReversed(item)
    );
  }

  canReverseTransferMovement(item: AccountMovementRecord): boolean {
    return (
      this.canReverseTransfer() &&
      item.sourceType === 'account_transfer_out' &&
      !this.isReversed(item)
    );
  }

  sourceTypeLabel(sourceType: string): string {
    switch (sourceType) {
      case 'opening_balance':
        return 'Opening Balance';
      case 'manual_inflow':
        return 'Manual Inflow';
      case 'manual_outflow':
        return 'Manual Outflow';
      case 'account_transfer_out':
        return 'Transfer Out';
      case 'account_transfer_in':
        return 'Transfer In';
      case 'expense':
        return 'Operating Expense';
      case 'customer_payment':
        return 'Customer Payment';
      case 'supplier_payment':
        return 'Supplier Payment';
      default:
        return sourceType;
    }
  }

  statusTone(status: string): UiBadgeTone {
    return status === 'active' ? 'success' : 'neutral';
  }

  formatAmount(amount: string | null | undefined): string {
    if (!amount) return '0.00';
    const num = Number(amount);
    if (isNaN(num)) return amount;
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  loadMovements(): void {
    const id = this.accountId();
    if (!id) return;
    this.api
      .listMovements(id, { page: this.movementsPage(), pageSize: this.movementsPageSize() })
      .subscribe({
        next: ({ items, meta }) => {
          this.movements.set(items);
          this.movementsTotal.set(meta.total);
        },
        error: (error: unknown) =>
          this.errorMessage.set(this.mapError(error, 'Unable to load account movements.')),
      });
  }

  onMovementsPageChange(page: number): void {
    this.movementsPage.set(page);
    this.loadMovements();
  }
  onMovementsPageSizeChange(pageSize: number): void {
    this.movementsPageSize.set(pageSize);
    this.movementsPage.set(1);
    this.loadMovements();
  }

  private reloadAccountState(id: string): void {
    forkJoin({
      account: this.api.getAccount(id),
      movements: this.api.listMovements(id, {
        page: this.movementsPage(),
        pageSize: this.movementsPageSize(),
      }),
    }).subscribe({
      next: ({ account, movements }) => {
        this.applyAccount(account);
        this.movements.set(movements.items);
        this.movementsTotal.set(movements.meta.total);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error, 'Unable to reload account.'));
      },
    });
  }

  private buildTypeSpecificCreateFields(value: ReturnType<typeof this.form.getRawValue>): {
    bankName?: string;
    accountNumberMasked?: string;
    walletIdentifier?: string;
  } {
    if (value.accountType === 'bank') {
      return {
        bankName: value.bankName.trim(),
        ...(value.accountNumberMasked.trim() === ''
          ? {}
          : { accountNumberMasked: value.accountNumberMasked.trim() }),
      };
    }
    if (value.accountType === 'jazzcash' || value.accountType === 'easypaisa') {
      return { walletIdentifier: value.walletIdentifier.trim() };
    }
    return {};
  }

  private buildAccountPatchPayload(value: ReturnType<typeof this.form.getRawValue>): {
    name?: string;
    status?: string;
    bankName?: string;
    accountNumberMasked?: string;
    walletIdentifier?: string;
  } {
    const payload: {
      name?: string;
      status?: string;
      bankName?: string;
      accountNumberMasked?: string;
      walletIdentifier?: string;
    } = {};

    if (this.canEditName()) {
      payload.name = value.name.trim();
    }
    if (this.canEditStatus()) {
      payload.status = value.status;
    }

    const accountType = this.accountType();
    if (accountType === 'bank' && this.showBankName() && this.canEditBankName()) {
      payload.bankName = value.bankName.trim();
    }
    if (
      accountType === 'bank' &&
      this.showAccountNumberMasked() &&
      this.canEditAccountNumberMasked()
    ) {
      payload.accountNumberMasked = value.accountNumberMasked.trim();
    }
    if (
      (accountType === 'jazzcash' || accountType === 'easypaisa') &&
      this.showWalletIdentifier() &&
      this.canEditWalletIdentifier()
    ) {
      payload.walletIdentifier = value.walletIdentifier.trim();
    }

    return payload;
  }

  private syncAccountTypeValidators(accountType: string): void {
    setRequiredValidator(this.form.controls.bankName, accountType === 'bank');
    setRequiredValidator(
      this.form.controls.walletIdentifier,
      accountType === 'jazzcash' || accountType === 'easypaisa',
    );
  }

  private accountTypeValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (
      typeof value === 'string' &&
      ACCOUNT_TYPES.includes(value as (typeof ACCOUNT_TYPES)[number])
    ) {
      return null;
    }
    return { invalidAccountType: true };
  }

  private applyAccount(account: AccountRecord): void {
    this.version = account.version;
    this.accountType.set(account.accountType);
    this.form.patchValue({
      accountType: account.accountType,
      name: account.name,
      bankName: account.bankName,
      accountNumberMasked: account.accountNumberMasked,
      walletIdentifier: account.walletIdentifier,
      status: account.status,
    });
    this.syncAccountTypeValidators(account.accountType);
    this.form.controls.accountType.disable();
    this.openingPosted.set(Boolean(account.openingBalance));
    this.derivedBalance.set(account.derivedBalances?.balance.amount ?? null);
    if (account.openingBalance) {
      this.openingForm.patchValue({ amount: account.openingBalance.amount.amount });
      this.openingForm.disable();
    }
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This account changed elsewhere. Reload and try again.';
    }
    if (error.status === 403) {
      return error.error?.error?.message ?? 'You do not have permission for this action.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
