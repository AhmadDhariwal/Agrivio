import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi, WarehouseRecord } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator, setRequiredValidator } from '../../../../shared/form/form-field.util';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import {
  InventoryBalanceRecord,
  ProductBatchRecord,
  WarehouseTransferRecord,
} from '../../models/inventory.models';

@Component({
  selector: 'agrivio-transfers-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
    UiConfirmDialogComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './transfers.page.html',
  styleUrl: './transfers.page.scss',
})
export class TransfersPage {
  private readonly inventoryApi = inject(InventoryApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly transfers = signal<WarehouseTransferRecord[]>([]);
  readonly page = signal(1); readonly pageSize = signal(25); readonly total = signal(0);
  readonly products = signal<ProductRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly batchOptions = signal<Array<{ batchId: string; label: string }>>([]);
  readonly selectedTrackingMode = signal<string>('none');
  readonly canTransfer = computed(() => this.sessionStore.hasPermission('inventory.transfer'));
  readonly canReverse = computed(() =>
    this.sessionStore.hasPermission('inventory.transfer.reverse'),
  );
  readonly reverseConfirmOpen = signal(false);
  private pendingReverse: WarehouseTransferRecord | null = null;

  readonly fieldRequired = hasRequiredValidator;

  readonly form = this.formBuilder.nonNullable.group({
    sourceWarehouseId: ['', Validators.required],
    destinationWarehouseId: ['', Validators.required],
    productId: ['', Validators.required],
    batchId: [''],
    quantity: ['', Validators.required],
    reason: ['', Validators.required],
  });

  constructor() {
    if (!this.canTransfer()) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      products: this.catalogApi.searchProductOptions(),
      warehouses: this.locationsApi.listWarehouseOptions(),
      transfers: this.inventoryApi.listTransfers({ page: this.page(), pageSize: this.pageSize() }),
    }).subscribe({
      next: ({ products, warehouses, transfers }) => {
        this.products.set(products.filter((item) => item.status === 'active'));
        this.warehouses.set(warehouses.filter((item) => item.status === 'active'));
        this.transfers.set(transfers.items);
        this.total.set(transfers.meta.total);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load transfers.');
      },
    });

    this.form.controls.sourceWarehouseId.valueChanges.subscribe(() => this.reloadBatchOptions());
    this.form.controls.productId.valueChanges.subscribe((productId) => {
      const product = this.products().find((item) => item.id === productId);
      this.selectedTrackingMode.set(product?.trackingMode ?? 'none');
      this.form.controls.batchId.setValue('');
      setRequiredValidator(this.form.controls.batchId, this.selectedTrackingMode() !== 'none');
      this.reloadBatchOptions();
    });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.form.getRawValue();
    const payload: Parameters<InventoryApi['createTransferDraft']>[0] = {
      sourceWarehouseId: value.sourceWarehouseId,
      destinationWarehouseId: value.destinationWarehouseId,
      productId: value.productId,
      quantity: value.quantity,
      reason: value.reason,
    };
    if (this.selectedTrackingMode() !== 'none' && value.batchId.trim() !== '') {
      payload.batchId = value.batchId;
    }

    this.inventoryApi.createTransferDraft(payload).subscribe({
      next: (draft) => {
        this.inventoryApi
          .postTransfer(draft.id, { reason: value.reason }, `xfer-post-${draft.id}-${Date.now()}`)
          .subscribe({
            next: () => {
              this.successMessage.set('Transfer posted.');
              this.saving.set(false);
              this.reloadTransfers();
            },
            error: (error: unknown) => {
              this.saving.set(false);
              this.errorMessage.set(this.mapError(error, 'Unable to post transfer.'));
            },
          });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to create transfer draft.'));
      },
    });
  }

  reverse(transfer: WarehouseTransferRecord): void {
    if (!this.canReverse() || transfer.status !== 'posted') {
      return;
    }
    this.pendingReverse = transfer;
    this.reverseConfirmOpen.set(true);
  }

  confirmReverse(reason: string): void {
    const transfer = this.pendingReverse;
    this.reverseConfirmOpen.set(false);
    this.pendingReverse = null;
    if (!transfer || !this.canReverse() || reason.trim() === '') {
      return;
    }
    this.inventoryApi
      .reverseTransfer(
        transfer.id,
        { reason: reason.trim() },
        `xfer-reverse-${transfer.id}-${Date.now()}`,
      )
      .subscribe({
        next: () => {
          this.successMessage.set('Transfer reversed.');
          this.reloadTransfers();
        },
        error: () => this.errorMessage.set('Unable to reverse transfer.'),
      });
  }

  private reloadBatchOptions(): void {
    const warehouseId = this.form.controls.sourceWarehouseId.value;
    const productId = this.form.controls.productId.value;
    if (!warehouseId || !productId || this.selectedTrackingMode() === 'none') {
      this.batchOptions.set([]);
      return;
    }
    forkJoin({
      balances: this.inventoryApi.listBalances({ warehouseId, productId }),
      batches: this.inventoryApi.listBatches({ productId }),
    }).subscribe({
      next: ({ balances, batches }) => {
        this.batchOptions.set(this.buildBatchOptions(balances.items, batches.items));
      },
      error: () => this.batchOptions.set([]),
    });
  }

  private buildBatchOptions(
    balances: InventoryBalanceRecord[],
    batches: ProductBatchRecord[],
  ): Array<{ batchId: string; label: string }> {
    const batchById = new Map(batches.map((batch) => [batch.id, batch]));
    return balances
      .filter((balance) => balance.batchId !== null && Number(balance.quantityBase) > 0)
      .map((balance) => {
        const batchId = String(balance.batchId);
        const batch = batchById.get(batchId);
        const name = batch?.batchNumber ?? batchId;
        return { batchId, label: `${name} (${balance.quantityBase})` };
      });
  }

  private reloadTransfers(): void {
    this.inventoryApi.listTransfers({ page: this.page(), pageSize: this.pageSize() }).subscribe({
      next: (result) => { this.transfers.set(result.items); this.total.set(result.meta.total); },
    });
  }

  onPageChange(page: number): void { this.page.set(page); this.reloadTransfers(); }
  onPageSizeChange(size: number): void { this.pageSize.set(size); this.page.set(1); this.reloadTransfers(); }

  onProductSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.catalogApi.searchProductOptions(target.value).subscribe((items) => this.products.set(items));
  }

  private mapError(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const body = (error as { error?: { error?: { message?: string } } }).error;
      if (body?.error?.message) {
        return body.error.message;
      }
    }
    return fallback;
  }
}
