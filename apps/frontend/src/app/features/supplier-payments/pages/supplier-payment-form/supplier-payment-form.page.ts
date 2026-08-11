import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import { SupplierLedgerEffectRecord } from '../../models/supplier-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { SupplierRecord } from '../../../suppliers/models/suppliers.models';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-supplier-payment-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './supplier-payment-form.page.html',
  styleUrl: './supplier-payment-form.page.scss',
})
export class SupplierPaymentFormPage {
  private readonly api = inject(SupplierPaymentsApi);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly suppliers = signal<SupplierRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly ledgerItems = signal<SupplierLedgerEffectRecord[]>([]);
  readonly canPost = computed(() => this.sessionStore.hasPermission('supplier-payments.post'));

  readonly form = this.formBuilder.nonNullable.group({
    supplierId: ['', Validators.required],
    accountId: ['', Validators.required],
    amount: ['', Validators.required],
    paymentDate: ['', Validators.required],
    notes: [''],
  });

  constructor() {
    if (!this.canPost()) {
      this.loading.set(false);
      return;
    }

    forkJoin({
      suppliers: this.suppliersApi.listSuppliers(),
      accounts: this.accountsApi.listAccounts(),
    }).subscribe({
      next: ({ suppliers, accounts }) => {
        this.suppliers.set(suppliers.filter((item) => item.status === 'active'));
        this.accounts.set(accounts.filter((item) => item.status === 'active'));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load payment form.'));
      },
    });

    this.form.controls.supplierId.valueChanges.subscribe((supplierId) => {
      this.ledgerItems.set([]);
      if (!supplierId) {
        return;
      }
      this.api.listSupplierLedger(supplierId).subscribe({
        next: (items) => this.ledgerItems.set(items),
        error: () => this.ledgerItems.set([]),
      });
    });
  }

  save(): void {
    if (!this.canPost() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.form.getRawValue();
    this.api
      .postSupplierPayment(
        {
          supplierId: value.supplierId,
          accountId: value.accountId,
          amount: { amount: value.amount.trim(), currency: 'PKR' },
          paymentDate: value.paymentDate,
          allocationMode: 'general',
          notes: value.notes.trim(),
        },
        crypto.randomUUID(),
      )
      .subscribe({
        next: (payment) => {
          this.saving.set(false);
          this.successMessage.set(
            `Payment posted (${payment.amount.amount} PKR). Unallocated remainder becomes supplier advance when there are no unpaid purchases.`,
          );
          this.form.patchValue({ amount: '', notes: '' });
          if (value.supplierId) {
            this.api.listSupplierLedger(value.supplierId).subscribe({
              next: (items) => this.ledgerItems.set(items),
            });
          }
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post supplier payment.'));
        },
      });
  }

  private mapError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message ?? fallback;
    }
    return fallback;
  }
}
