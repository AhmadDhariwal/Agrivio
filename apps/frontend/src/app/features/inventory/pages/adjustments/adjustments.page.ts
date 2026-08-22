import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import {
  BranchesWarehousesApi,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import {
  hasRequiredValidator,
  setRequiredValidator,
} from '../../../../shared/form/form-field.util';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { InventoryBalanceRecord, StockAdjustmentRecord } from '../../models/inventory.models';

export interface BatchOption {
  batchId: string;
  quantityBase: string;
  label: string;
}

@Component({
  selector: 'agrivio-adjustments-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
    UiFieldLabelComponent,
    UiModuleInfoComponent,
    UiConfirmDialogComponent,
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

  // Loading & Action State
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Adjustments History
  readonly adjustments = signal<StockAdjustmentRecord[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);

  // Master Data
  readonly products = signal<ProductRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly batchOptions = signal<BatchOption[]>([]);
  readonly balancesList = signal<InventoryBalanceRecord[]>([]);

  // Selected State
  readonly selectedProduct = signal<ProductRecord | null>(null);
  readonly selectedTrackingMode = signal<string>('none');
  readonly productStockOnHand = signal<string | null>(null);
  readonly selectedBatchStockOnHand = signal<string | null>(null);

  // Permissions
  readonly canAdjust = computed(() => this.sessionStore.hasPermission('inventory.adjust'));
  readonly canReverse = computed(() => this.sessionStore.hasPermission('inventory.adjust.reverse'));
  readonly canOverride = computed(() =>
    this.sessionStore.hasPermission('inventory.negative-stock.override'),
  );

  // Reversal Dialog State
  readonly reverseConfirmOpen = signal(false);
  private pendingReverse: StockAdjustmentRecord | null = null;

  readonly fieldRequired = hasRequiredValidator;

  // Module Info Content
  readonly infoTitle = 'About Stock Adjustments';
  readonly infoDescription =
    'Use stock adjustments to record auditable inventory corrections for damage, expiry, loss, or authorized corrections.';
  readonly infoItems = [
    'Adjustments are auditable inventory corrections recorded through stock movements.',
    'Quantity changes post directly to authoritative inventory balances.',
    'Batch details are required when the selected product is configured for batch tracking.',
    'Existing stock integrity rules and negative stock protections remain enforced.',
  ];

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
      products: this.catalogApi.searchProductOptions('', 500, 'active'),
      warehouses: this.locationsApi.listWarehouseOptions(),
      adjustments: this.inventoryApi.listAdjustments({
        page: this.page(),
        pageSize: this.pageSize(),
      }),
    }).subscribe({
      next: ({ products, warehouses, adjustments }) => {
        this.products.set(products.filter((item) => item.status === 'active'));
        this.warehouses.set(warehouses.filter((item) => item.status === 'active'));
        this.adjustments.set(adjustments.items);
        this.total.set(adjustments.meta.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load adjustments data.'));
      },
    });

    // Downstream state reset: Warehouse changes
    this.form.controls.warehouseId.valueChanges.subscribe(() => {
      this.form.patchValue({ batchId: '' }, { emitEvent: false });
      this.selectedBatchStockOnHand.set(null);
      this.reloadStockAndBatchContext();
    });

    // Downstream state reset: Product changes
    this.form.controls.productId.valueChanges.subscribe((productId) => {
      const product = this.products().find((item) => item.id === productId) ?? null;
      this.selectedProduct.set(product);
      const mode = product?.trackingMode ?? 'none';
      this.selectedTrackingMode.set(mode);
      this.form.patchValue({ batchId: '' }, { emitEvent: false });
      this.selectedBatchStockOnHand.set(null);
      this.syncBatchRequired(mode);
      this.reloadStockAndBatchContext();
    });

    // Downstream state reset: Batch selection changes
    this.form.controls.batchId.valueChanges.subscribe((batchId) => {
      if (!batchId) {
        this.selectedBatchStockOnHand.set(null);
        return;
      }
      const option = this.batchOptions().find((opt) => opt.batchId === batchId);
      this.selectedBatchStockOnHand.set(option ? option.quantityBase : null);
    });

    // Downstream state reset: Adjustment Type changes
    this.form.controls.adjustmentType.valueChanges.subscribe((type) => {
      if (type !== 'correction') {
        this.form.patchValue(
          { direction: 'outbound', inventoryValue: '' },
          { emitEvent: false },
        );
        this.syncCorrectionRequired();
      } else {
        this.syncCorrectionRequired();
      }
    });

    // Downstream state reset: Direction changes
    this.form.controls.direction.valueChanges.subscribe((direction) => {
      if (direction !== 'inbound') {
        this.form.patchValue({ inventoryValue: '' }, { emitEvent: false });
      }
      this.syncCorrectionRequired();
      // Re-filter batch options: inbound correction may expose zero-balance batches
      this.refreshBatchOptions();
    });

    // Downstream state reset: Negative Stock Override changes
    this.form.controls.negativeStockOverride.valueChanges.subscribe((override) => {
      if (!override) {
        this.form.patchValue({ negativeStockOverrideReason: '' }, { emitEvent: false });
      }
      this.syncOverrideReasonRequired();
    });
  }

  private syncBatchRequired(mode: string): void {
    setRequiredValidator(this.form.controls.batchId, mode !== 'none');
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

  private reloadStockAndBatchContext(): void {
    const warehouseId = this.form.controls.warehouseId.value;
    const productId = this.form.controls.productId.value;
    const product = this.selectedProduct();

    if (!warehouseId || !productId) {
      this.batchOptions.set([]);
      this.balancesList.set([]);
      this.productStockOnHand.set(null);
      this.selectedBatchStockOnHand.set(null);
      return;
    }

    this.inventoryApi.listBalances({ warehouseId, productId, pageSize: 100 }).subscribe({
      next: (result) => {
        const items = result.items || [];
        this.balancesList.set(items);

        // Aggregate Product Stock on Hand across all balances in this warehouse
        const totalQty = items.reduce((acc, b) => acc + Number(b.quantityBase || 0), 0);
        const formattedQty = totalQty % 1 === 0 ? totalQty.toString() : totalQty.toFixed(4);
        this.productStockOnHand.set(formattedQty);

        // Batch options when tracking is enabled
        if (product && product.trackingMode !== 'none') {
          this.refreshBatchOptions();
        } else {
          this.batchOptions.set([]);
        }
      },
      error: () => {
        this.batchOptions.set([]);
        this.balancesList.set([]);
        this.productStockOnHand.set(null);
        this.selectedBatchStockOnHand.set(null);
      },
    });
  }

  /**
   * Re-derives batch dropdown options from the already-loaded balancesList.
   * For inbound corrections, zero-balance batches are valid (increasing an existing
   * depleted batch is an authorised operation). For all other workflows, only
   * positive-balance batches are included to avoid confusing selectors.
   */
  private refreshBatchOptions(): void {
    const product = this.selectedProduct();
    if (!product || product.trackingMode === 'none') {
      this.batchOptions.set([]);
      return;
    }
    const isInboundCorrection =
      this.form.controls.adjustmentType.value === 'correction' &&
      this.form.controls.direction.value === 'inbound';

    const options: BatchOption[] = this.balancesList()
      .filter((b) => {
        if (b.batchId === null) return false;
        // Allow zero-balance batches only when increasing stock via inbound correction
        return isInboundCorrection ? true : Number(b.quantityBase) > 0;
      })
      .map((b) => {
        const batchId = String(b.batchId);
        const qty = Number(b.quantityBase);
        const qtyLabel = qty === 0 ? 'empty' : `${b.quantityBase} ${product.baseUnitCode}`;
        return {
          batchId,
          quantityBase: b.quantityBase,
          label: `${batchId} (${qtyLabel})`,
        };
      });
    this.batchOptions.set(options);
  }

  formatTrackingLabel(mode?: string | null): string {
    if (mode === 'batch_expiry') return 'Batch + Expiry Tracked';
    if (mode === 'batch') return 'Batch Tracked';
    return 'Standard (None)';
  }

  formatAdjustmentTypeLabel(type: string): string {
    switch (type) {
      case 'damage':
        return 'Damage';
      case 'expiry':
        return 'Expiry';
      case 'loss':
        return 'Loss';
      case 'correction':
        return 'Correction';
      default:
        return type;
    }
  }

  onProductSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      const q = target.value.trim();
      this.catalogApi.searchProductOptions(q, 500, 'active').subscribe({
        next: (items) => {
          this.products.set(items.filter((p) => p.status === 'active'));
        },
      });
    }
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
      quantity: value.quantity.trim(),
      reason: value.reason.trim(),
    };

    if (this.selectedTrackingMode() !== 'none' && value.batchId.trim() !== '') {
      payload.batchId = value.batchId.trim();
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
        } = { reason: value.reason.trim() };

        if (value.negativeStockOverride) {
          postPayload.negativeStockOverride = true;
          if (value.negativeStockOverrideReason.trim() !== '') {
            postPayload.negativeStockOverrideReason = value.negativeStockOverrideReason.trim();
          }
        }

        const idempotencyKey = `adj-post-${draft.id}-${Date.now()}`;
        this.inventoryApi.postAdjustment(draft.id, postPayload, idempotencyKey).subscribe({
          next: () => {
            this.successMessage.set('Stock adjustment posted successfully.');
            this.saving.set(false);
            this.resetForm();
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

  private resetForm(): void {
    this.form.reset({
      warehouseId: this.form.controls.warehouseId.value,
      productId: '',
      batchId: '',
      adjustmentType: 'damage',
      direction: 'outbound',
      quantity: '',
      reason: '',
      inventoryValue: '',
      negativeStockOverride: false,
      negativeStockOverrideReason: '',
    });
    this.selectedProduct.set(null);
    this.selectedTrackingMode.set('none');
    this.productStockOnHand.set(null);
    this.selectedBatchStockOnHand.set(null);
    this.batchOptions.set([]);
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

    const idempotencyKey = `adj-reverse-${adjustment.id}-${Date.now()}`;
    this.inventoryApi
      .reverseAdjustment(adjustment.id, { reason: reason.trim() }, idempotencyKey)
      .subscribe({
        next: () => {
          this.successMessage.set('Stock adjustment reversed successfully.');
          this.reloadAdjustments();
          this.reloadStockAndBatchContext();
        },
        error: (error: unknown) => {
          this.errorMessage.set(this.mapError(error, 'Unable to reverse adjustment.'));
        },
      });
  }

  private reloadAdjustments(): void {
    this.inventoryApi
      .listAdjustments({ page: this.page(), pageSize: this.pageSize() })
      .subscribe({
        next: (result) => {
          this.adjustments.set(result.items);
          this.total.set(result.meta.total);
        },
      });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.reloadAdjustments();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.reloadAdjustments();
  }

  private mapError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.error?.message;
      if (typeof message === 'string' && message.trim() !== '') {
        return message;
      }
    } else if (typeof error === 'object' && error !== null && 'error' in error) {
      const body = (error as { error?: { error?: { message?: string } } }).error;
      if (body?.error?.message) {
        return body.error.message;
      }
    }
    return fallback;
  }
}
