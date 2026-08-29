import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  EMPTY,
  Observable,
  Subject,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  switchMap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import {
  BranchesWarehousesApi,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
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
import {
  InventoryBalanceRecord,
  WarehouseTransferRecord,
} from '../../models/inventory.models';

export interface TransferBatchOption {
  batchId: string;
  label: string;
  quantityBase: string;
}

function differentWarehousesValidator(group: AbstractControl): ValidationErrors | null {
  const source = group.get('sourceWarehouseId')?.value;
  const dest = group.get('destinationWarehouseId')?.value;
  if (source && dest && source === dest) {
    return { sameWarehouse: true };
  }
  return null;
}

@Component({
  selector: 'agrivio-transfers-page',
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
  templateUrl: './transfers.page.html',
  styleUrls: ['./transfers.page.scss'],
})
export class TransfersPage {
  private readonly inventoryApi = inject(InventoryApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stockContextRequests = new Subject<void>();
  private readonly productSearchChanges = new Subject<string>();

  // Core State
  readonly transfers = signal<WarehouseTransferRecord[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Master Data
  readonly products = signal<ProductRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly batchOptions = signal<TransferBatchOption[]>([]);
  readonly balancesList = signal<InventoryBalanceRecord[]>([]);

  // Selected State
  readonly selectedProduct = signal<ProductRecord | null>(null);
  readonly selectedTrackingMode = signal<string>('none');
  readonly productSourceStockOnHand = signal<string | null>(null);
  readonly selectedBatchStockOnHand = signal<string | null>(null);
  readonly overrideActive = signal<boolean>(false);

  // Permissions & Organization Capability Computeds
  readonly canUseTransfers = computed(
    () => this.capabilityService?.canUseModule('inventory.transfers') ?? true,
  );
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseView('inventory.transfers.features.moduleInfo') ?? true,
  );
  readonly showProductSearch = computed(
    () => this.capabilityService?.canUseView('inventory.transfers.features.productSearch') ?? true,
  );
  readonly showProductContext = computed(
    () => this.capabilityService?.canUseView('inventory.transfers.features.productContext') ?? true,
  );
  readonly showStockContext = computed(
    () => this.capabilityService?.canUseView('inventory.transfers.features.stockContext') ?? true,
  );
  readonly showGuidance = computed(
    () => this.capabilityService?.canUseView('inventory.transfers.features.guidance') ?? true,
  );
  readonly showRecentTransfers = computed(
    () => this.capabilityService?.canUseView('inventory.transfers.features.recentTransfers') ?? true,
  );
  readonly showServerTransferDate = computed(
    () =>
      this.capabilityService?.canUseView('inventory.transfers.features.serverTransferDate') ?? true,
  );

  readonly canPostTransfer = computed(
    () =>
      this.canUseTransfers() &&
      this.sessionStore.hasPermission('inventory.transfer') &&
      (this.capabilityService?.canPerformAction('inventory.transfers.actions.post') ?? true),
  );
  readonly canReverseTransfer = computed(
    () =>
      this.canUseTransfers() &&
      this.sessionStore.hasPermission('inventory.transfer.reverse') &&
      (this.capabilityService?.canPerformAction('inventory.transfers.actions.reverse') ?? true),
  );
  readonly canInspectTransfer = computed(
    () =>
      this.canUseTransfers() &&
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canPerformAction('inventory.transfers.actions.inspect') ?? true),
  );
  readonly canViewStock = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canUseModule('inventory.stock') ?? true) &&
      (this.capabilityService?.canPerformAction('inventory.transfers.actions.viewStock') ?? true),
  );

  readonly canTransfer = computed(() => this.sessionStore.hasPermission('inventory.transfer'));
  readonly canReverse = computed(() => this.canReverseTransfer());
  readonly canOverride = computed(() =>
    this.sessionStore.hasPermission('inventory.negative-stock.override'),
  );

  // Reversal Dialog State
  readonly reverseConfirmOpen = signal(false);
  private pendingReverse: WarehouseTransferRecord | null = null;

  // Inspector Drawer State
  readonly selectedTransfer = signal<WarehouseTransferRecord | null>(null);

  readonly fieldRequired = hasRequiredValidator;

  // Module Info Content
  readonly infoTitle = 'About Warehouse Transfers';
  readonly infoDescription =
    'Transfer stock from one warehouse to another while preserving stock traceability and maintaining accurate inventory across locations.';
  readonly infoItems = [
    'Transfers move inventory between warehouses while preserving batch and expiry traceability.',
    'Source and destination warehouses must be active and distinct.',
    'Tracked products require batch selection scoped to available source warehouse stock.',
    'Posting transfers creates auditable stock movement records in both source and destination warehouses.',
  ];

  readonly form = this.formBuilder.nonNullable.group(
    {
      sourceWarehouseId: ['', Validators.required],
      destinationWarehouseId: ['', Validators.required],
      productId: ['', Validators.required],
      batchId: [''],
      quantity: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,4})?$/)]],
      reason: ['', Validators.required],
      negativeStockOverride: [false],
      negativeStockOverrideReason: [''],
    },
    {
      validators: [differentWarehousesValidator],
    },
  );

  constructor() {
    if (!this.canUseTransfers() || !this.canTransfer()) {
      this.loading.set(false);
      return;
    }

    const requests: {
      products: Observable<ProductRecord[]>;
      warehouses: Observable<WarehouseRecord[]>;
      transfers?: Observable<{ items: WarehouseTransferRecord[]; meta: { total: number } }>;
    } = {
      products: this.catalogApi.searchProductOptions('', 500, 'active'),
      warehouses: this.locationsApi.listWarehouseOptions(),
    };

    if (this.showRecentTransfers()) {
      requests.transfers = this.inventoryApi.listTransfers({
        page: this.page(),
        pageSize: this.pageSize(),
      });
    }

    forkJoin(requests).subscribe({
      next: ({ products, warehouses, transfers }) => {
        this.products.set(products.filter((item) => item.status === 'active'));
        this.warehouses.set((warehouses || []).filter((item) => item.status === 'active'));
        if (transfers) {
          this.transfers.set(transfers.items);
          this.total.set(transfers.meta.total);
        }
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load transfers.'));
      },
    });

    // Downstream state reset: Source Warehouse changes
    this.form.controls.sourceWarehouseId.valueChanges.subscribe(() => {
      this.form.patchValue({ batchId: '' }, { emitEvent: false });
      this.selectedBatchStockOnHand.set(null);
      this.validateDifferentWarehouses();
      this.requestStockAndBatchContext();
    });

    // Downstream state reset: Destination Warehouse changes
    this.form.controls.destinationWarehouseId.valueChanges.subscribe(() => {
      this.validateDifferentWarehouses();
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
      this.requestStockAndBatchContext();
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

    // Downstream state reset: Negative Stock Override changes
    this.form.controls.negativeStockOverride.valueChanges.subscribe((override) => {
      this.overrideActive.set(override);
      if (!override) {
        this.form.patchValue({ negativeStockOverrideReason: '' }, { emitEvent: false });
      }
      this.syncOverrideReasonRequired();
    });

    this.stockContextRequests
      .pipe(
        switchMap(() => {
          const warehouseId = this.form.controls.sourceWarehouseId.value;
          const productId = this.form.controls.productId.value;

          if (!warehouseId || !productId) {
            this.batchOptions.set([]);
            this.balancesList.set([]);
            this.productSourceStockOnHand.set(null);
            this.selectedBatchStockOnHand.set(null);
            return EMPTY;
          }

          return this.inventoryApi.listBalances({
            warehouseId,
            productId,
            page: 1,
            pageSize: 100,
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          const balanceItems = result.items || [];
          this.balancesList.set(balanceItems);

          const totalQty = balanceItems.reduce((acc, b) => acc + Number(b.quantityBase || 0), 0);
          const formattedQty = totalQty % 1 === 0 ? totalQty.toString() : totalQty.toFixed(4);
          this.productSourceStockOnHand.set(formattedQty);

          const product = this.selectedProduct();
          if (product && product.trackingMode !== 'none') {
            const options: TransferBatchOption[] = balanceItems
              .filter((b) => b.batchId !== null && Number(b.quantityBase) > 0)
              .map((b) => {
                const batchId = String(b.batchId);
                return {
                  batchId,
                  label: `${batchId} (${b.quantityBase} ${product.baseUnitCode})`,
                  quantityBase: b.quantityBase,
                };
              });
            this.batchOptions.set(options);
          } else {
            this.batchOptions.set([]);
          }
        },
        error: () => {
          this.batchOptions.set([]);
          this.balancesList.set([]);
          this.productSourceStockOnHand.set(null);
          this.selectedBatchStockOnHand.set(null);
        },
      });

    this.productSearchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.catalogApi.searchProductOptions(query, 500, 'active')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.products.set(items.filter((p) => p.status === 'active'));
      });
  }

  private requestStockAndBatchContext(): void {
    this.stockContextRequests.next();
  }

  private validateDifferentWarehouses(): void {
    const source = this.form.controls.sourceWarehouseId.value;
    const dest = this.form.controls.destinationWarehouseId.value;
    if (source && dest && source === dest) {
      this.form.controls.destinationWarehouseId.setErrors({
        ...(this.form.controls.destinationWarehouseId.errors || {}),
        sameWarehouse: true,
      });
    } else if (this.form.controls.destinationWarehouseId.hasError('sameWarehouse')) {
      const errors = { ...this.form.controls.destinationWarehouseId.errors };
      delete errors['sameWarehouse'];
      this.form.controls.destinationWarehouseId.setErrors(
        Object.keys(errors).length > 0 ? errors : null,
      );
    }
  }

  private syncBatchRequired(mode: string): void {
    setRequiredValidator(this.form.controls.batchId, mode !== 'none');
  }

  private syncOverrideReasonRequired(): void {
    setRequiredValidator(
      this.form.controls.negativeStockOverrideReason,
      this.form.controls.negativeStockOverride.value === true,
    );
  }

  submit(): void {
    this.validateDifferentWarehouses();
    if (this.form.invalid || this.saving() || !this.canPostTransfer()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.sourceWarehouseId === value.destinationWarehouseId) {
      this.errorMessage.set('Source and destination warehouses must differ.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const draftPayload: Parameters<InventoryApi['createTransferDraft']>[0] = {
      sourceWarehouseId: value.sourceWarehouseId,
      destinationWarehouseId: value.destinationWarehouseId,
      productId: value.productId,
      quantity: value.quantity,
      reason: value.reason,
    };
    if (this.selectedTrackingMode() !== 'none' && value.batchId.trim() !== '') {
      draftPayload.batchId = value.batchId;
    }

    this.inventoryApi.createTransferDraft(draftPayload).subscribe({
      next: (draft) => {
        const postPayload: {
          reason: string;
          negativeStockOverride?: boolean;
          negativeStockOverrideReason?: string;
        } = { reason: value.reason };
        if (value.negativeStockOverride) {
          postPayload.negativeStockOverride = true;
          postPayload.negativeStockOverrideReason = value.negativeStockOverrideReason;
        }

        const idempotencyKey = `xfer-post-${draft.id}-${Date.now()}`;
        this.inventoryApi.postTransfer(draft.id, postPayload, idempotencyKey).subscribe({
          next: () => {
            this.successMessage.set('Transfer posted successfully.');
            this.saving.set(false);
            this.resetForm();
            this.reloadTransfers(true);
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

  private resetForm(): void {
    this.form.reset({
      sourceWarehouseId: '',
      destinationWarehouseId: '',
      productId: '',
      batchId: '',
      quantity: '',
      reason: '',
      negativeStockOverride: false,
      negativeStockOverrideReason: '',
    });
    this.selectedProduct.set(null);
    this.selectedTrackingMode.set('none');
    this.productSourceStockOnHand.set(null);
    this.selectedBatchStockOnHand.set(null);
    this.overrideActive.set(false);
    this.batchOptions.set([]);
    this.balancesList.set([]);
  }

  reverse(transfer: WarehouseTransferRecord): void {
    if (!this.canReverseTransfer() || transfer.status !== 'posted') {
      return;
    }
    this.pendingReverse = transfer;
    this.reverseConfirmOpen.set(true);
  }

  confirmReverse(reason: string): void {
    const transfer = this.pendingReverse;
    this.reverseConfirmOpen.set(false);
    this.pendingReverse = null;
    if (!transfer || !this.canReverseTransfer() || reason.trim() === '') {
      return;
    }
    const idempotencyKey = `xfer-reverse-${transfer.id}-${Date.now()}`;
    this.inventoryApi
      .reverseTransfer(transfer.id, { reason: reason.trim() }, idempotencyKey)
      .subscribe({
        next: () => {
          this.successMessage.set('Transfer reversed successfully.');
          this.reloadTransfers(true);
        },
        error: (error: unknown) => {
          this.errorMessage.set(this.mapError(error, 'Unable to reverse transfer.'));
        },
      });
  }

  openInspector(transfer: WarehouseTransferRecord): void {
    if (!this.canInspectTransfer()) {
      return;
    }
    this.selectedTransfer.set(transfer);
  }

  closeInspector(): void {
    this.selectedTransfer.set(null);
  }

  reloadTransfers(forceRefresh = false): void {
    if (!this.showRecentTransfers()) {
      return;
    }
    this.inventoryApi
      .listTransfers({ page: this.page(), pageSize: this.pageSize(), forceRefresh })
      .subscribe({
        next: (result) => {
          this.transfers.set(result.items);
          this.total.set(result.meta.total);
        },
      });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.reloadTransfers();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.reloadTransfers();
  }

  onProductSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.productSearchChanges.next(target.value.trim());
    }
  }

  transferProductName(item: WarehouseTransferRecord): string {
    return item.productNameSnapshot ?? '—';
  }

  transferProductSku(item: WarehouseTransferRecord): string {
    return item.productSkuSnapshot ?? '—';
  }

  transferSourceWarehouseName(item: WarehouseTransferRecord): string {
    return item.sourceWarehouseNameSnapshot ?? '—';
  }

  transferDestinationWarehouseName(item: WarehouseTransferRecord): string {
    return item.destinationWarehouseNameSnapshot ?? '—';
  }

  formatTrackingLabel(mode: string | null | undefined): string {
    switch (mode) {
      case 'batch':
        return 'Batch Tracked';
      case 'batch_expiry':
        return 'Batch + Expiry';
      case 'none':
      default:
        return 'Standard';
    }
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
