import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  switchMap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReturnsApi } from '../../data-access/returns.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { InventoryApi } from '../../../inventory/data-access/inventory.api';
import {
  BranchesWarehousesApi,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { CustomerRecord } from '../../../customers/models/customers.models';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { ProductBatchRecord } from '../../../inventory/models/inventory.models';
import { UnsellableReason } from '../../models/returns.models';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import {
  fieldValidationMessage,
  hasRequiredValidator,
  setRequiredValidator,
} from '../../../../shared/form/form-field.util';
import {
  inventoryMoneyValidators,
  inventoryQuantityValidators,
} from '../../../inventory/shared/inventory-form.validation';

@Component({
  selector: 'agrivio-return-without-invoice-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './return-without-invoice.page.html',
  styleUrl: './return-without-invoice.page.scss',
})
export class ReturnWithoutInvoicePage {
  private readonly api = inject(ReturnsApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly inventoryApi = inject(InventoryApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly customerSearchChanges = new Subject<string>();
  private readonly productSearchChanges = new Subject<string>();

  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly formSubmitAttempted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly products = signal<ProductRecord[]>([]);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly batchesByLine = signal<Record<number, ProductBatchRecord[]>>({});
  readonly formValid = signal(false);
  readonly canPost = computed(
    () =>
      this.sessionStore.hasPermission('returns.post') &&
      (this.capabilityService?.canPerformAction('returns.actions.post') ?? true),
  );
  readonly canApprove = computed(
    () =>
      this.sessionStore.hasPermission('returns.without-invoice.approve') &&
      (this.capabilityService?.canPerformAction('returns.actions.withoutInvoice') ?? true),
  );
  readonly canSubmit = computed(
    () => this.canPost() && this.canApprove() && this.formValid() && !this.submitting(),
  );

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly form = this.formBuilder.nonNullable.group({
    warehouseId: ['', Validators.required],
    customerId: [''],
    customerIdentifyingName: [''],
    customerIdentifyingPhone: [''],
    reason: ['', Validators.required],
    resolution: ['ledger_adjustment' as 'ledger_adjustment' | 'account_refund', Validators.required],
    refundAccountId: [''],
    approvedReturnValue: ['', inventoryMoneyValidators],
    lines: this.formBuilder.array([this.createLineGroup()]),
  });

  get lines(): FormArray {
    return this.form.controls.lines;
  }

  constructor() {
    forkJoin({
      warehouses: this.locationsApi.listWarehouseOptions(),
      accounts: this.accountsApi.listAccountOptions(),
    }).subscribe({
      next: ({ warehouses, accounts }) => {
        this.warehouses.set(this.sessionStore.filterWarehouses(warehouses));
        this.accounts.set(accounts.filter((item) => item.status === 'active'));
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Unable to load lookup data.');
        this.loading.set(false);
      },
    });

    this.form.statusChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateFormValidity();
    });
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateFormValidity();
    });

    this.customerSearchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.customersApi.searchCustomerOptions(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.customers.set(items.filter((item) => item.status === 'active'));
        this.updateFormValidity();
      });

    this.productSearchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.catalogApi.searchProductOptions(query, 25, 'active')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.products.set(items.filter((item) => item.status === 'active'));
        for (let i = 0; i < this.lines.length; i += 1) {
          setRequiredValidator(this.lineGroup(i).get('batchId'), this.productNeedsBatch(i));
        }
        this.updateFormValidity();
      });

    this.customerSearchChanges.next('');
    this.productSearchChanges.next('');

    this.form.controls.resolution.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((resolution) => {
        setRequiredValidator(this.form.controls.refundAccountId, resolution === 'account_refund');
        this.updateFormValidity();
      });
    this.bindLineConditionalRequired(0);
    this.updateFormValidity();
  }

  updateFormValidity(): void {
    const isBasicValid = this.form.valid;
    const value = this.form.getRawValue();

    const hasCustomer = Boolean(
      (value.customerId && value.customerId.trim() !== '') ||
      (value.customerIdentifyingName && value.customerIdentifyingName.trim() !== '') ||
      (value.customerIdentifyingPhone && value.customerIdentifyingPhone.trim() !== '')
    );

    const ledgerValid =
      value.resolution !== 'ledger_adjustment' || Boolean(value.customerId && value.customerId.trim() !== '');

    const linesValid =
      this.lines.length > 0 &&
      this.lines.controls.every((ctrl, idx) => {
        const group = ctrl as FormGroup;
        if (!group.valid) return false;
        const productId = group.get('productId')?.value;
        const quantity = group.get('quantity')?.value;
        if (!productId || !quantity || group.get('quantity')?.invalid) return false;
        if (this.productNeedsBatch(idx) && !group.get('batchId')?.value) return false;
        return true;
      });

    this.formValid.set(Boolean(isBasicValid && hasCustomer && ledgerValid && linesValid));
  }

  hasCustomerIdentifier(): boolean {
    const value = this.form.getRawValue();
    return Boolean(
      (value.customerId && value.customerId.trim() !== '') ||
      (value.customerIdentifyingName && value.customerIdentifyingName.trim() !== '') ||
      (value.customerIdentifyingPhone && value.customerIdentifyingPhone.trim() !== '')
    );
  }

  needsCustomerForLedger(): boolean {
    const value = this.form.getRawValue();
    return value.resolution === 'ledger_adjustment' && (!value.customerId || value.customerId.trim() === '');
  }

  needsAccountForRefund(): boolean {
    const value = this.form.getRawValue();
    return value.resolution === 'account_refund' && (!value.refundAccountId || value.refundAccountId.trim() === '');
  }

  missingLineFields(): boolean {
    if (this.lines.length === 0) return true;
    return this.lines.controls.some((ctrl, idx) => {
      const g = ctrl as FormGroup;
      const pid = g.get('productId')?.value;
      const qty = g.get('quantity')?.value;
      if (!pid || !qty || g.get('quantity')?.invalid) return true;
      if (this.productNeedsBatch(idx) && !g.get('batchId')?.value) return true;
      return false;
    });
  }

  lineGroup(index: number): FormGroup {
    return this.lines.at(index) as FormGroup;
  }

  lineFieldError(index: number, controlName: string, label: string): string | null {
    return fieldValidationMessage(
      this.lineGroup(index).get(controlName),
      label,
      this.formSubmitAttempted(),
    );
  }

  onCustomerSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.customerSearchChanges.next(target.value.trim());
    }
  }

  onProductSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.productSearchChanges.next(target.value.trim());
    }
  }

  addLine(): void {
    this.lines.push(this.createLineGroup());
    this.bindLineConditionalRequired(this.lines.length - 1);
    this.updateFormValidity();
  }

  removeLine(index: number): void {
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
      this.batchesByLine.update((current) => {
        const next: Record<number, ProductBatchRecord[]> = {};
        let targetIdx = 0;
        for (let i = 0; i < this.lines.length + 1; i += 1) {
          if (i !== index) {
            const batches = current[i];
            if (batches) {
              next[targetIdx] = batches;
            }
            targetIdx += 1;
          }
        }
        return next;
      });
      this.updateFormValidity();
    }
  }

  productNeedsBatch(index: number): boolean {
    const productId = String(this.lineGroup(index).get('productId')?.value ?? '');
    const product = this.products().find((item) => item.id === productId);
    return Boolean(product && product.trackingMode !== 'none');
  }

  batchesForLine(index: number): ProductBatchRecord[] {
    return this.batchesByLine()[index] ?? [];
  }

  onProductChange(index: number): void {
    const productId = String(this.lineGroup(index).get('productId')?.value ?? '');
    this.lineGroup(index).patchValue({ batchId: '' });
    setRequiredValidator(this.lineGroup(index).get('batchId'), this.productNeedsBatch(index));
    this.updateFormValidity();
    if (!productId || !this.productNeedsBatch(index)) {
      this.batchesByLine.update((current) => ({ ...current, [index]: [] }));
      return;
    }
    this.inventoryApi.listBatches({ productId, pageSize: 100 }).subscribe({
      next: (batches) => {
        this.batchesByLine.update((current) => ({ ...current, [index]: batches.items }));
        this.updateFormValidity();
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error, 'Unable to load batches.'));
      },
    });
  }

  submit(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    for (let index = 0; index < this.lines.length; index += 1) {
      this.lineGroup(index).markAllAsTouched();
    }
    this.updateFormValidity();
    if (!this.canSubmit()) {
      if (!this.canApprove()) {
        this.errorMessage.set('Return without invoice requires approval permission.');
      } else if (!this.hasCustomerIdentifier()) {
        this.errorMessage.set('Customer lookup or identifying name/phone is required.');
      } else if (this.needsCustomerForLedger()) {
        this.errorMessage.set('Customer ledger adjustment requires selecting a registered customer. For walk-in customers, select Cash / bank / digital refund.');
      } else if (this.needsAccountForRefund()) {
        this.errorMessage.set('Please select a refund payment account for cash/bank refund.');
      } else {
        this.errorMessage.set('Please complete all required fields correctly before approving and posting.');
      }
      return;
    }
    const value = this.form.getRawValue();
    if (!value.customerId && !value.customerIdentifyingName && !value.customerIdentifyingPhone) {
      this.errorMessage.set('Customer lookup or identifying name/phone is required.');
      return;
    }
    const lines = (value.lines as Array<{
      productId: string;
      quantity: string;
      batchId: string;
      stockCondition: 'sellable' | 'unsellable';
      unsellableReason: string;
    }>)
      .filter((line) => line.productId && line.quantity.trim() !== '')
      .map((line) => ({
        productId: line.productId,
        quantity: line.quantity.trim(),
        batchId: line.batchId.trim() === '' ? null : line.batchId.trim(),
        stockCondition: line.stockCondition,
        unsellableReason:
          line.stockCondition === 'unsellable'
            ? (line.unsellableReason as UnsellableReason)
            : null,
      }));
    if (lines.length === 0) {
      this.errorMessage.set('Add at least one product line.');
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.api
      .createWithoutInvoice({
        warehouseId: value.warehouseId,
        customerId: value.customerId.trim() === '' ? null : value.customerId.trim(),
        customerIdentifyingName: value.customerIdentifyingName.trim() || null,
        customerIdentifyingPhone: value.customerIdentifyingPhone.trim() || null,
        lines,
      })
      .pipe(
        switchMap((draft) =>
          this.api.postReturn(
            draft.id,
            {
              reason: value.reason.trim(),
              expectedVersion: draft.version,
              resolution: value.resolution,
              refundAccountId:
                value.resolution === 'account_refund' ? value.refundAccountId : null,
              approvedReturnValue: { amount: value.approvedReturnValue.trim(), currency: 'PKR' },
              lines: lines.map((line, index) => ({
                originalLineIndex: index,
                stockCondition: line.stockCondition,
                unsellableReason: line.unsellableReason,
              })),
            },
            crypto.randomUUID(),
          ),
        ),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          void this.router.navigateByUrl('/app/returns');
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post return without invoice.'));
        },
      });
  }

  private bindLineConditionalRequired(index: number): void {
    const group = this.lineGroup(index);
    setRequiredValidator(group.get('batchId'), this.productNeedsBatch(index));
    setRequiredValidator(group.get('unsellableReason'), group.get('stockCondition')?.value === 'unsellable');
    group.get('stockCondition')?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((condition) => {
      setRequiredValidator(group.get('unsellableReason'), condition === 'unsellable');
      this.updateFormValidity();
    });
  }

  private createLineGroup(): FormGroup {
    return this.formBuilder.nonNullable.group({
      productId: ['', Validators.required],
      quantity: ['', inventoryQuantityValidators],
      batchId: [''],
      stockCondition: ['sellable', Validators.required],
      unsellableReason: ['damaged'],
    });
  }

  private mapError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) {
        return error.error?.error?.message ?? 'You do not have permission for this action.';
      }
      const message = error.error?.error?.message;
      if (typeof message === 'string' && message.trim() !== '') {
        return message;
      }
    }
    return fallback;
  }
}
