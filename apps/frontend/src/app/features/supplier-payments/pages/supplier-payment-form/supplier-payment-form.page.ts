import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import {
  InvoiceAllocationInput,
  SupplierLedgerEffectRecord,
  SupplierPaymentRecord,
  UnpaidPurchaseRecord,
} from '../../models/supplier-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { SupplierRecord } from '../../../suppliers/models/suppliers.models';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';

@Component({
  selector: 'agrivio-supplier-payment-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
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
  readonly loadingUnpaid = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly suppliers = signal<SupplierRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly ledgerItems = signal<SupplierLedgerEffectRecord[]>([]);
  readonly unpaidPurchases = signal<UnpaidPurchaseRecord[]>([]);
  readonly lastPayment = signal<SupplierPaymentRecord | null>(null);
  readonly canPost = computed(() => this.sessionStore.hasPermission('supplier-payments.post'));

  readonly fieldRequired = hasRequiredValidator;

  readonly form = this.formBuilder.nonNullable.group({
    supplierId: ['', Validators.required],
    accountId: ['', Validators.required],
    allocationMode: ['general' as 'general' | 'invoice_specific', Validators.required],
    amount: ['', Validators.required],
    paymentDate: ['', Validators.required],
    notes: [''],
  });

  readonly invoiceAllocationForm = this.formBuilder.nonNullable.group({
    purchaseId: ['', Validators.required],
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
      this.unpaidPurchases.set([]);
      if (!supplierId) {
        return;
      }
      this.api.listSupplierLedger(supplierId).subscribe({
        next: (items) => this.ledgerItems.set(items),
        error: () => this.ledgerItems.set([]),
      });
      if (this.isInvoiceSpecific()) {
        this.loadUnpaidPurchases(supplierId);
      }
    });

    this.form.controls.allocationMode.valueChanges.subscribe((mode) => {
      const supplierId = this.form.controls.supplierId.value;
      if (mode === 'invoice_specific' && supplierId) {
        this.loadUnpaidPurchases(supplierId);
      } else {
        this.unpaidPurchases.set([]);
      }
    });
  }

  private loadUnpaidPurchases(supplierId: string): void {
    this.loadingUnpaid.set(true);
    this.api.listUnpaidPurchases(supplierId).subscribe({
      next: (items) => {
        this.unpaidPurchases.set(items);
        this.loadingUnpaid.set(false);
      },
      error: () => {
        this.unpaidPurchases.set([]);
        this.loadingUnpaid.set(false);
      },
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

    let allocations: InvoiceAllocationInput[] | undefined;
    if (value.allocationMode === 'invoice_specific') {
      const inv = this.invoiceAllocationForm.getRawValue();
      if (!inv.purchaseId || !inv.allocationAmount) {
        this.errorMessage.set('Select a purchase and enter an allocation amount.');
        this.saving.set(false);
        return;
      }
      allocations = [{ purchaseId: inv.purchaseId, amount: { amount: inv.allocationAmount.trim(), currency: 'PKR' } }];
    }

    this.api
      .postSupplierPayment(
        {
          supplierId: value.supplierId,
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
          const advanceAlloc = payment.allocations?.find((a) => a.targetType === 'supplier_advance');
          const advancePart = advanceAlloc
            ? ` Supplier advance: ${advanceAlloc.allocatedAmount.amount} PKR.`
            : '';
          this.successMessage.set(
            `Payment posted (${payment.amount.amount} PKR).${advancePart}`,
          );
          this.form.patchValue({ amount: '', notes: '' });
          this.invoiceAllocationForm.reset();
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
