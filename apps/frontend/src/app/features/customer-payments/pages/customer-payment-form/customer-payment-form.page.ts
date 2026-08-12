import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { CustomerPaymentsApi } from '../../data-access/customer-payments.api';
import {
  CustomerLedgerEffectRecord,
  CustomerPaymentRecord,
} from '../../models/customer-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { CustomerRecord } from '../../../customers/models/customers.models';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-customer-payment-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './customer-payment-form.page.html',
  styleUrl: './customer-payment-form.page.scss',
})
export class CustomerPaymentFormPage {
  private readonly api = inject(CustomerPaymentsApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly ledgerItems = signal<CustomerLedgerEffectRecord[]>([]);
  readonly lastPayment = signal<CustomerPaymentRecord | null>(null);
  readonly canPost = computed(() => this.sessionStore.hasPermission('customer-payments.post'));

  readonly form = this.formBuilder.nonNullable.group({
    customerId: ['', Validators.required],
    accountId: ['', Validators.required],
    allocationMode: ['general' as 'general' | 'invoice_specific', Validators.required],
    amount: ['', Validators.required],
    paymentDate: ['', Validators.required],
    notes: [''],
  });

  readonly invoiceAllocationForm = this.formBuilder.nonNullable.group({
    saleId: ['', Validators.required],
    allocationAmount: ['', Validators.required],
  });

  readonly isInvoiceSpecific = computed(
    () => this.form.controls.allocationMode.value === 'invoice_specific',
  );

  constructor() {
    if (!this.canPost()) {
      this.loading.set(false);
      return;
    }

    forkJoin({
      customers: this.customersApi.listCustomers(),
      accounts: this.accountsApi.listAccounts(),
    }).subscribe({
      next: ({ customers, accounts }) => {
        this.customers.set(customers.filter((item) => item.status === 'active'));
        this.accounts.set(accounts.filter((item) => item.status === 'active'));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load payment form.'));
      },
    });

    this.form.controls.customerId.valueChanges.subscribe((customerId) => {
      this.ledgerItems.set([]);
      if (!customerId) {
        return;
      }
      this.api.listCustomerLedger(customerId).subscribe({
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

    let allocations: Array<{ saleId: string; amount: { amount: string; currency: string } }> | undefined;
    if (value.allocationMode === 'invoice_specific') {
      const inv = this.invoiceAllocationForm.getRawValue();
      if (!inv.saleId || !inv.allocationAmount) {
        this.errorMessage.set('Select a sale and enter an allocation amount.');
        this.saving.set(false);
        return;
      }
      allocations = [
        {
          saleId: inv.saleId,
          amount: { amount: inv.allocationAmount.trim(), currency: 'PKR' },
        },
      ];
    }

    this.api
      .postCustomerPayment(
        {
          customerId: value.customerId,
          accountId: value.accountId,
          amount: { amount: value.amount.trim(), currency: 'PKR' },
          paymentDate: value.paymentDate,
          allocationMode: value.allocationMode,
          notes: value.notes.trim(),
          ...(allocations ? { allocations } : {}),
        },
        crypto.randomUUID(),
      )
      .subscribe({
        next: (payment) => {
          this.saving.set(false);
          this.lastPayment.set(payment);
          const advanceAlloc = payment.allocations?.find((a) => a.targetType === 'customer_advance');
          const advancePart = advanceAlloc
            ? ` Customer advance: ${advanceAlloc.allocatedAmount.amount} PKR.`
            : '';
          this.successMessage.set(`Payment posted (${payment.amount.amount} PKR).${advancePart}`);
          this.form.patchValue({ amount: '', notes: '' });
          this.invoiceAllocationForm.reset();
          if (value.customerId) {
            this.api.listCustomerLedger(value.customerId).subscribe({
              next: (items) => this.ledgerItems.set(items),
            });
          }
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post customer payment.'));
        },
      });
  }

  allocationGroupAt(_index: number): FormGroup {
    return this.invoiceAllocationForm as unknown as FormGroup;
  }

  private mapError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message ?? fallback;
    }
    return fallback;
  }
}
