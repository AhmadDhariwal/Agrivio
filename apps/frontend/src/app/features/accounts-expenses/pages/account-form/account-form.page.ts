import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { AccountMovementRecord, AccountRecord } from '../../models/accounts.models';
import { forkJoin, of } from 'rxjs';

@Component({
  selector: 'agrivio-account-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
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

  readonly accountId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly postingOpening = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly openingPosted = signal(false);
  readonly derivedBalance = signal<string | null>(null);
  readonly movements = signal<AccountMovementRecord[]>([]);
  readonly canManage = computed(() => this.sessionStore.hasPermission('accounts.manage'));
  readonly canView = computed(() => this.sessionStore.hasPermission('accounts.view'));
  readonly canPostOpening = computed(() =>
    this.sessionStore.hasPermission('accounts.opening-balance.post'),
  );
  readonly canPostTransaction = computed(() =>
    this.sessionStore.hasPermission('accounts.transaction.post'),
  );
  readonly canCorrectTransaction = computed(() =>
    this.sessionStore.hasPermission('accounts.transaction.correct'),
  );
  readonly canTransfer = computed(() => this.sessionStore.hasPermission('accounts.transfer'));
  readonly canReverseTransfer = computed(() =>
    this.sessionStore.hasPermission('accounts.transfer.reverse'),
  );
  readonly accountType = signal('cash');
  readonly destinationAccounts = signal<AccountRecord[]>([]);
  readonly postingTransaction = signal(false);
  readonly postingTransfer = signal(false);
  readonly reversing = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly reverseTarget = signal<{ kind: 'transaction' | 'transfer'; id: string } | null>(null);
  private version = 1;

  readonly form = this.formBuilder.nonNullable.group({
    accountType: ['cash' as string, [Validators.required]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    bankName: [''],
    accountNumberMasked: [''],
    walletIdentifier: [''],
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
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.accountId.set(id);
      this.loading.set(true);
      forkJoin({
        account: this.api.getAccount(id),
        movements: this.canView() ? this.api.listMovements(id) : of([]),
        accounts: this.api.listAccounts(),
      }).subscribe({
        next: ({ account, movements, accounts }) => {
          this.applyAccount(account);
          this.movements.set(movements);
          this.destinationAccounts.set(accounts.filter((item) => item.id !== id && item.status === 'active'));
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
    if (!this.canManage() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.form.getRawValue();

    if (this.accountId() === null) {
      this.api
        .createAccount({
          name: value.name,
          accountType: value.accountType,
          ...(value.accountType === 'bank'
            ? {
                bankName: value.bankName,
                ...(value.accountNumberMasked.trim() === ''
                  ? {}
                  : { accountNumberMasked: value.accountNumberMasked }),
              }
            : {}),
          ...(value.accountType === 'jazzcash' || value.accountType === 'easypaisa'
            ? { walletIdentifier: value.walletIdentifier }
            : {}),
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

    this.api
      .updateAccount(this.accountId()!, {
        expectedVersion: this.version,
        name: value.name,
        status: value.status,
        ...(value.accountType === 'bank'
          ? {
              bankName: value.bankName,
              accountNumberMasked: value.accountNumberMasked,
            }
          : {}),
        ...(value.accountType === 'jazzcash' || value.accountType === 'easypaisa'
          ? { walletIdentifier: value.walletIdentifier }
          : {}),
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
          this.api.listMovements(id).subscribe({
            next: (movements) => this.movements.set(movements),
          });
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
          this.transactionForm.reset({ direction: 'inflow', amount: '', purpose: '', reference: '' });
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

  private reloadAccountState(id: string): void {
    forkJoin({
      account: this.api.getAccount(id),
      movements: this.api.listMovements(id),
    }).subscribe({
      next: ({ account, movements }) => {
        this.applyAccount(account);
        this.movements.set(movements);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error, 'Unable to reload account.'));
      },
    });
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
