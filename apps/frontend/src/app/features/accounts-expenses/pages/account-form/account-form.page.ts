import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

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
  readonly errorMessage = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('accounts.manage'));
  readonly accountType = signal('cash');
  private version = 1;

  readonly form = this.formBuilder.nonNullable.group({
    accountType: ['cash' as string, [Validators.required]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    bankName: [''],
    accountNumberMasked: [''],
    walletIdentifier: [''],
    status: ['active'],
  });

  constructor() {
    this.form.controls.accountType.valueChanges.subscribe((value) => {
      this.accountType.set(value);
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.accountId.set(id);
      this.loading.set(true);
      this.api.getAccount(id).subscribe({
        next: (account) => {
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

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This account changed elsewhere. Reload and try again.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
