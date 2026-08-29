import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  of,
  switchMap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { hasRequiredValidator, fieldValidationMessage } from '../../../../shared/form/form-field.util';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

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
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly supplierSearchChanges = new Subject<string>();

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadingUnpaid = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly suppliers = signal<SupplierRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly ledgerItems = signal<SupplierLedgerEffectRecord[]>([]);
  readonly unpaidPurchases = signal<UnpaidPurchaseRecord[]>([]);
  readonly lastPayment = signal<SupplierPaymentRecord | null>(null);
  readonly canUseSupplierPayments = computed(
    () => this.capabilityService?.canUseModule('payments.supplier') ?? true,
  );
  readonly canPost = computed(
    () =>
      this.sessionStore.hasPermission('supplier-payments.post') &&
      this.canUseSupplierPayments() &&
      (this.capabilityService?.canPerformAction('payments.supplier.actions.post') ?? true),
  );
  readonly canPostInvoiceSpecific = computed(
    () =>
      this.canPost() &&
      (this.capabilityService?.canPerformAction(
        'payments.supplier.actions.postInvoiceSpecific',
      ) ?? true),
  );
  readonly canViewLedger = computed(
    () =>
      this.sessionStore.hasPermission('supplier-payments.view') &&
      this.canUseSupplierPayments() &&
      (this.capabilityService?.canPerformAction('payments.supplier.actions.viewLedger') ?? true),
  );

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;
  readonly canSave = computed(() => {
    if (!this.canPost() || this.saving()) {
      return false;
    }
    if (this.form.invalid) {
      return false;
    }
    if (this.isInvoiceSpecific() && this.invoiceAllocationForm.invalid) {
      return false;
    }
    return true;
  });

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

  private readonly allocationModeChange = toSignal(
    this.form.controls.allocationMode.valueChanges,
    { initialValue: this.form.controls.allocationMode.value },
  );

  readonly isInvoiceSpecific = computed(
    () => this.canPostInvoiceSpecific() && this.allocationModeChange() === 'invoice_specific',
  );

  canViewField(id: string): boolean {
    return this.capabilityService?.canViewField(`payments.supplier.fields.${id}`) ?? true;
  }

  canEditField(id: string): boolean {
    return this.capabilityService?.canEditField(`payments.supplier.fields.${id}`) ?? true;
  }

  constructor() {
    if (!this.canPost()) {
      this.loading.set(false);
      return;
    }

    this.supplierSearchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.suppliersApi.searchSupplierOptions(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.suppliers.set(items.filter((item) => item.status === 'active')));

    this.supplierSearchChanges.next('');

    this.accountsApi.listAccountOptions().subscribe({
      next: (accounts) => {
        this.accounts.set(accounts.filter((item) => item.status === 'active'));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load payment form.'));
      },
    });

    this.form.controls.supplierId.valueChanges
      .pipe(
        switchMap((supplierId) => {
          this.ledgerItems.set([]);
          this.unpaidPurchases.set([]);
          if (!supplierId) {
            return of({
              ledger: [] as SupplierLedgerEffectRecord[],
              unpaid: [] as UnpaidPurchaseRecord[],
            });
          }
          const ledger$ = this.canViewLedger()
            ? this.api.listSupplierLedger(supplierId)
            : of([] as SupplierLedgerEffectRecord[]);
          const unpaid$ = this.isInvoiceSpecific()
            ? this.api.listUnpaidPurchases(supplierId)
            : of([] as UnpaidPurchaseRecord[]);
          return forkJoin({ ledger: ledger$, unpaid: unpaid$ });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ ledger, unpaid }) => {
          this.ledgerItems.set(ledger);
          this.unpaidPurchases.set(unpaid);
          this.loadingUnpaid.set(false);
        },
        error: () => {
          this.ledgerItems.set([]);
          this.unpaidPurchases.set([]);
          this.loadingUnpaid.set(false);
        },
      });

    this.form.controls.allocationMode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mode) => {
        const supplierId = this.form.controls.supplierId.value;
        if (mode === 'invoice_specific' && supplierId) {
          this.loadUnpaidPurchases(supplierId);
        } else {
          this.unpaidPurchases.set([]);
        }
      });
  }

  onSupplierSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.supplierSearchChanges.next(target.value.trim());
    }
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
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    if (this.isInvoiceSpecific()) {
      this.invoiceAllocationForm.markAllAsTouched();
    }
    if (!this.canPost() || this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    if (value.allocationMode === 'invoice_specific' && !this.canPostInvoiceSpecific()) {
      this.errorMessage.set('Invoice-specific supplier payments are not enabled.');
      return;
    }
    if (value.allocationMode === 'invoice_specific' && this.invoiceAllocationForm.invalid) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    let allocations: InvoiceAllocationInput[] | undefined;
    if (value.allocationMode === 'invoice_specific') {
      const inv = this.invoiceAllocationForm.getRawValue();
      allocations = [
        {
          purchaseId: inv.purchaseId,
          amount: { amount: inv.allocationAmount.trim(), currency: 'PKR' },
        },
      ];
    }

    this.api
      .postSupplierPayment(
        {
          supplierId: value.supplierId,
          accountId: value.accountId,
          amount: { amount: value.amount.trim(), currency: 'PKR' },
          paymentDate: value.paymentDate,
          allocationMode: value.allocationMode,
          ...(this.canEditField('notes') ? { notes: value.notes.trim() } : {}),
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
          this.successMessage.set(`Payment posted (${payment.amount.amount} PKR).${advancePart}`);
          this.form.patchValue({ amount: '', notes: '' });
          this.invoiceAllocationForm.reset();
          if (value.supplierId && this.canViewLedger()) {
            this.api.listSupplierLedger(value.supplierId, { forceRefresh: true }).subscribe({
              next: (items) => this.ledgerItems.set(items),
            });
          }
          if (value.supplierId && value.allocationMode === 'invoice_specific') {
            this.api.listUnpaidPurchases(value.supplierId, { forceRefresh: true }).subscribe({
              next: (items) => this.unpaidPurchases.set(items),
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
