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
import { InventoryBalanceRecord, StockAdjustmentRecord } from '../../models/inventory.models';

@Component({
  selector: 'agrivio-adjustments-page',
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
  templateUrl: './adjustments.page.html',
  styleUrl: './adjustments.page.scss',
})
export class AdjustmentsPage {
  private readonly inventoryApi = inject(InventoryApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly adjustments = signal<StockAdjustmentRecord[]>([]);
  readonly page = signal(1); readonly pageSize = signal(25); readonly total = signal(0);
  readonly products = signal<ProductRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly batchOptions = signal<Array<{ batchId: string; label: string }>>([]);
  readonly selectedTrackingMode = signal<string>('none');
  readonly canAdjust = computed(() => this.sessionStore.hasPermission('inventory.adjust'));
  readonly canReverse = computed(() => this.sessionStore.hasPermission('inventory.adjust.reverse'));
  readonly canOverride = computed(() => this.sessionStore.hasPermission('inventory.negative-stock.override'));
  readonly reverseConfirmOpen = signal(false);
  private pendingReverse: StockAdjustmentRecord | null = null;

  readonly fieldRequired = hasRequiredValidator;

  readonly form = this.formBuilder.nonNullable.group({
    warehouseId: ['', Validators.required],
    productId: ['', Validators.required],
    batchId: [''],
    adjustmentType: ['damage', Validators.required],
    direction: ['outbound'],
    quantity: ['', Validators.required],
    reason: ['', Validators.required],
    inventoryValue: [''],
    negativeStockOverride: [false],
    negativeStockOverrideReason: [''],
  });

  constructor() {
    if (!this.canAdjust()) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      products: this.catalogApi.searchProductOptions(),
      warehouses: this.locationsApi.listWarehouseOptions(),
      adjustments: this.inventoryApi.listAdjustments({ page: this.page(), pageSize: this.pageSize() }),
    }).subscribe({
      next: ({ products, warehouses, adjustments }) => {
        this.products.set(products.filter((item) => item.status === 'active'));
        this.warehouses.set(warehouses.filter((item) => item.status === 'active'));
        this.adjustments.set(adjustments.items);
        this.total.set(adjustments.meta.total);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load adjustments.');
      },
    });

    this.form.controls.warehouseId.valueChanges.subscribe(() => this.reloadBatchOptions());
    this.form.controls.productId.valueChanges.subscribe((productId) => {
      const product = this.products().find((item) => item.id === productId);
      this.selectedTrackingMode.set(product?.trackingMode ?? 'none');
      this.form.controls.batchId.setValue('');
      this.syncBatchRequired();
      this.reloadBatchOptions();
    });
    this.form.controls.adjustmentType.valueChanges.subscribe(() => this.syncCorrectionRequired());
    this.form.controls.direction.valueChanges.subscribe(() => this.syncCorrectionRequired());
    this.form.controls.negativeStockOverride.valueChanges.subscribe(() => this.syncOverrideReasonRequired());
  }

  private syncBatchRequired(): void {
    setRequiredValidator(this.form.controls.batchId, this.selectedTrackingMode() !== 'none');
  }

  private syncCorrectionRequired(): void {
    const inboundCorrection =
      this.form.controls.adjustmentType.value === 'correction' &&
      this.form.controls.direction.value === 'inbound';
    setRequiredValidator(this.form.controls.inventoryValue, inboundCorrection);
  }

  private syncOverrideReasonRequired(): void {
    setRequiredValidator(
      this.form.controls.negativeStockOverrideReason,
      this.form.controls.negativeStockOverride.value === true,
    );
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
    const payload: Parameters<InventoryApi['createAdjustmentDraft']>[0] = {
      warehouseId: value.warehouseId,
      productId: value.productId,
      adjustmentType: value.adjustmentType,
      quantity: value.quantity,
      reason: value.reason,
    };
    if (this.selectedTrackingMode() !== 'none' && value.batchId.trim() !== '') {
      payload.batchId = value.batchId;
    }
    if (value.adjustmentType === 'correction') {
      payload.direction = value.direction;
      if (value.direction === 'inbound' && value.inventoryValue.trim() !== '') {
        payload.inventoryValue = { amount: value.inventoryValue.trim(), currency: 'PKR' };
      }
    }

    this.inventoryApi.createAdjustmentDraft(payload).subscribe({
      next: (draft) => {
        const postPayload: {
          reason: string;
          negativeStockOverride?: boolean;
          negativeStockOverrideReason?: string;
        } = { reason: value.reason };
        if (value.negativeStockOverride) {
          postPayload.negativeStockOverride = true;
          if (value.negativeStockOverrideReason.trim() !== '') {
            postPayload.negativeStockOverrideReason = value.negativeStockOverrideReason.trim();
          }
        }
        this.inventoryApi
          .postAdjustment(draft.id, postPayload, `adj-post-${draft.id}-${Date.now()}`)
          .subscribe({
            next: () => {
              this.successMessage.set('Adjustment posted.');
              this.saving.set(false);
              this.reloadAdjustments();
            },
            error: (error: unknown) => {
              this.saving.set(false);
              this.errorMessage.set(this.mapError(error, 'Unable to post adjustment.'));
            },
          });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to create adjustment draft.'));
      },
    });
  }

  reverse(adjustment: StockAdjustmentRecord): void {
    if (!this.canReverse() || adjustment.status !== 'posted') {
      return;
    }
    this.pendingReverse = adjustment;
    this.reverseConfirmOpen.set(true);
  }

  confirmReverse(reason: string): void {
    const adjustment = this.pendingReverse;
    this.reverseConfirmOpen.set(false);
    this.pendingReverse = null;
    if (!adjustment || !this.canReverse() || reason.trim() === '') {
      return;
    }
    this.inventoryApi
      .reverseAdjustment(
        adjustment.id,
        { reason: reason.trim() },
        `adj-reverse-${adjustment.id}-${Date.now()}`,
      )
      .subscribe({
        next: () => {
          this.successMessage.set('Adjustment reversed.');
          this.reloadAdjustments();
        },
        error: () => this.errorMessage.set('Unable to reverse adjustment.'),
      });
  }

  private reloadBatchOptions(): void {
    const warehouseId = this.form.controls.warehouseId.value;
    const productId = this.form.controls.productId.value;
    if (!warehouseId || !productId || this.selectedTrackingMode() === 'none') {
      this.batchOptions.set([]);
      return;
    }
    this.inventoryApi.listBalances({ warehouseId, productId }).subscribe({
      next: (balances) => {
        this.batchOptions.set(this.buildBatchOptions(balances.items));
      },
      error: () => this.batchOptions.set([]),
    });
  }

  private buildBatchOptions(
    balances: InventoryBalanceRecord[],
  ): Array<{ batchId: string; label: string }> {
    return balances
      .filter((balance) => balance.batchId !== null && Number(balance.quantityBase) > 0)
      .map((balance) => {
        const batchId = String(balance.batchId);
        return { batchId, label: `${batchId} (${balance.quantityBase})` };
      });
  }

  private reloadAdjustments(): void {
    this.inventoryApi.listAdjustments({ page: this.page(), pageSize: this.pageSize() }).subscribe({
      next: (result) => { this.adjustments.set(result.items); this.total.set(result.meta.total); },
    });
  }

  onPageChange(page: number): void { this.page.set(page); this.reloadAdjustments(); }
  onPageSizeChange(size: number): void { this.pageSize.set(size); this.page.set(1); this.reloadAdjustments(); }

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
