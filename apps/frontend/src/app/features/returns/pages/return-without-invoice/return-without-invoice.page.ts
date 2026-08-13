import { Component, computed, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, switchMap } from 'rxjs';
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
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { CustomerRecord } from '../../../customers/models/customers.models';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { ProductBatchRecord } from '../../../inventory/models/inventory.models';
import { UnsellableReason } from '../../models/returns.models';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-return-without-invoice-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
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
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly products = signal<ProductRecord[]>([]);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly batchesByLine = signal<Record<number, ProductBatchRecord[]>>({});
  readonly canPost = computed(() => this.sessionStore.hasPermission('returns.post'));
  readonly canApprove = computed(() =>
    this.sessionStore.hasPermission('returns.without-invoice.approve'),
  );

  readonly form = this.formBuilder.nonNullable.group({
    warehouseId: ['', Validators.required],
    customerId: [''],
    customerIdentifyingName: [''],
    customerIdentifyingPhone: [''],
    reason: ['', Validators.required],
    resolution: ['ledger_adjustment' as 'ledger_adjustment' | 'account_refund', Validators.required],
    refundAccountId: [''],
    approvedReturnValue: ['', Validators.required],
    lines: this.formBuilder.array([this.createLineGroup()]),
  });

  get lines(): FormArray {
    return this.form.controls.lines;
  }

  constructor() {
    forkJoin({
      products: this.catalogApi.listProducts(),
      customers: this.customersApi.listCustomers(),
      warehouses: this.locationsApi.listWarehouses(),
      accounts: this.accountsApi.listAccounts(),
    }).subscribe({
      next: ({ products, customers, warehouses, accounts }) => {
        this.products.set(products.filter((item) => item.status === 'active'));
        this.customers.set(customers);
        this.warehouses.set(this.sessionStore.filterWarehouses(warehouses));
        this.accounts.set(accounts.filter((item) => item.status === 'active'));
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Unable to load lookup data.');
        this.loading.set(false);
      },
    });
  }

  lineGroup(index: number): FormGroup {
    return this.lines.at(index) as FormGroup;
  }

  addLine(): void {
    this.lines.push(this.createLineGroup());
  }

  removeLine(index: number): void {
    if (this.lines.length > 1) {
      this.lines.removeAt(index);
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
    if (!productId || !this.productNeedsBatch(index)) {
      this.batchesByLine.update((current) => ({ ...current, [index]: [] }));
      return;
    }
    this.inventoryApi.listBatches({ productId }).subscribe({
      next: (batches) => {
        this.batchesByLine.update((current) => ({ ...current, [index]: batches }));
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error, 'Unable to load batches.'));
      },
    });
  }

  submit(): void {
    if (!this.canPost() || !this.canApprove() || this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      if (!this.canApprove()) {
        this.errorMessage.set('Return without invoice requires approval permission.');
      }
      return;
    }
    const value = this.form.getRawValue();
    if (!value.customerId && !value.customerIdentifyingName && !value.customerIdentifyingPhone) {
      this.errorMessage.set('Customer lookup or identifying name/phone is required.');
      return;
    }
    if (value.resolution === 'account_refund' && !value.refundAccountId) {
      this.errorMessage.set('Select a cash, bank, or digital refund account.');
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

  private createLineGroup(): FormGroup {
    return this.formBuilder.nonNullable.group({
      productId: ['', Validators.required],
      quantity: ['', Validators.required],
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
