import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { CustomerPaymentsApi } from '../../data-access/customer-payments.api';
import {
  CustomerLedgerEffectRecord,
  CustomerPaymentRecord,
  MoneyAmount,
} from '../../models/customer-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { CustomerRecord } from '../../../customers/models/customers.models';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';

@Component({
  selector: 'agrivio-customer-payment-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './customer-payment-form.page.html',
  styleUrl: './customer-payment-form.page.scss',
})
export class CustomerPaymentFormPage {
  private readonly api = inject(CustomerPaymentsApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly ledgerItems = signal<CustomerLedgerEffectRecord[]>([]);
  readonly lastPayment = signal<CustomerPaymentRecord | null>(null);
  readonly canUseCustomerPayments = computed(
    () => this.capabilityService?.canUseModule('payments.customer') ?? true,
  );
  readonly canPost = computed(
    () =>
      this.sessionStore.hasPermission('customer-payments.post') &&
      this.canUseCustomerPayments() &&
      (this.capabilityService?.canPerformAction('payments.customer.actions.post') ?? true),
  );
  readonly canPostInvoiceSpecific = computed(
    () =>
      this.canPost() &&
      (this.capabilityService?.canPerformAction('payments.customer.actions.postInvoiceSpecific') ?? true),
  );
  readonly showCustomerSearch = computed(
    () => this.capabilityService?.canUseFeature('payments.customer.features.customerSearch') ?? true,
  );
  readonly showLedgerPreview = computed(
    () => this.capabilityService?.canUseFeature('payments.customer.features.ledgerPreview') ?? true,
  );

  canViewField(id: string): boolean {
    return this.capabilityService?.canViewField(`payments.customer.fields.${id}`) ?? true;
  }

  canEditField(id: string): boolean {
    return this.capabilityService?.canEditField(`payments.customer.fields.${id}`) ?? true;
  }

  readonly fieldRequired = hasRequiredValidator;

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

  private readonly allocationModeChange = toSignal(
    this.form.controls.allocationMode.valueChanges,
    { initialValue: this.form.controls.allocationMode.value },
  );

  readonly isInvoiceSpecific = computed(
    () => this.canPostInvoiceSpecific() && this.allocationModeChange() === 'invoice_specific',
  );

  constructor() {
    if (!this.canPost()) {
      this.loading.set(false);
      return;
    }

    forkJoin({
      customers: this.customersApi.searchCustomerOptions(),
      accounts: this.accountsApi.listAccountOptions(),
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
      if (!customerId || !this.showLedgerPreview()) {
        return;
      }
      this.api.listCustomerLedger(customerId).subscribe({
        next: (items) => this.ledgerItems.set(items),
        error: () => this.ledgerItems.set([]),
      });
    });
  }

  onCustomerSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.customersApi.searchCustomerOptions(target.value).subscribe((items) => this.customers.set(items.filter((item) => item.status === 'active')));
    }
  }

  save(): void {
    if (!this.canPost() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();

    if (value.allocationMode === 'invoice_specific' && (!this.canPostInvoiceSpecific() || this.invoiceAllocationForm.invalid)) {
      this.invoiceAllocationForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    let allocations: Array<{ saleId: string; amount: { amount: string; currency: string } }> | undefined;
    if (value.allocationMode === 'invoice_specific' && this.canPostInvoiceSpecific()) {
      const inv = this.invoiceAllocationForm.getRawValue();
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
          notes: this.canViewField('notes') ? value.notes.trim() : '',
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
          if (value.customerId && this.showLedgerPreview()) {
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

  setAllocationMode(mode: 'general' | 'invoice_specific'): void {
    if (mode === 'invoice_specific' && !this.canPostInvoiceSpecific()) {
      return;
    }
    this.form.controls.allocationMode.setValue(mode);
  }

  formatCurrency(val?: MoneyAmount | string | number | null): string {
    if (val === undefined || val === null) return 'PKR 0.00';
    if (typeof val === 'object') {
      if (!val.amount) return `${val.currency || 'PKR'} 0.00`;
      const num = Number(val.amount);
      if (isNaN(num)) return `${val.currency || 'PKR'} ${val.amount}`;
      return `${val.currency || 'PKR'} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    const num = Number(val);
    if (isNaN(num)) return `PKR ${val}`;
    return `PKR ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private mapError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message ?? fallback;
    }
    return fallback;
  }
}
