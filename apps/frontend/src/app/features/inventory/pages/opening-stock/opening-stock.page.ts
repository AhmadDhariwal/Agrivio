import { Component, computed, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { UiSearchableDropdownComponent } from '../../../../shared/ui/ui-searchable-dropdown/ui-searchable-dropdown.component';
import {
  formatPackagingUnitOption,
  formatProductOption,
  formatWarehouseOption,
} from '../../../../shared/ui/ui-searchable-dropdown/entity-dropdown-formatters';
import {
  hasRequiredValidator,
  fieldValidationMessage,
  setRequiredValidator,
} from '../../../../shared/form/form-field.util';
import {
  inventoryMoneyValidators,
  inventoryMoneyValidator,
  inventoryQuantityValidators,
} from '../../shared/inventory-form.validation';
import { PackagingUnitRecord, ProductRecord } from '../../../catalog/models/catalog.models';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

import { OpeningStockRecord } from '../../models/inventory.models';

@Component({
  selector: 'agrivio-opening-stock-page',
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
    UiSearchableDropdownComponent,
  ],
  templateUrl: './opening-stock.page.html',
  styleUrl: './opening-stock.page.scss',
})
export class OpeningStockPage {
  private readonly inventoryApi = inject(InventoryApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly formBuilder = inject(FormBuilder);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef);
  private readonly productSearchChanges = new Subject<string>();

  readonly openingStockRecord = signal<OpeningStockRecord | null>(null);
  readonly isDraft = computed(() => this.openingStockRecord()?.status === 'draft');
  readonly isPosted = computed(() => this.openingStockRecord()?.status === 'posted');
  readonly discardDialogOpen = signal(false);
  readonly discarding = signal(false);
  readonly postDialogOpen = signal(false);
  readonly pendingPost = signal<OpeningStockRecord | null>(null);
  readonly savingDraft = signal(false);
  readonly isEditing = signal(true);

  // History List
  readonly recentOpeningStock = signal<OpeningStockRecord[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly statusFilter = signal<string>('draft');
  private pendingDiscard: OpeningStockRecord | null = null;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly formSubmitAttempted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly products = signal<ProductRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly packagingUnits = signal<PackagingUnitRecord[]>([]);
  readonly selectedTrackingMode = signal<string>('none');

  readonly warehouseOptions = computed(() =>
    this.warehouses().map((w) => formatWarehouseOption(w)),
  );
  readonly productOptions = computed(() =>
    this.products().map((p) => formatProductOption(p)),
  );
  readonly packagingOptions = computed(() =>
    this.packagingUnits().map((u) => formatPackagingUnitOption(u)),
  );
  readonly canUseOpeningStock = computed(
    () => this.capabilityService?.canUseModule('inventory.openingStock') ?? true,
  );
  readonly showOpeningStockModuleInfo = computed(
    () => this.capabilityService?.canUseView('inventory.openingStock.features.moduleInfo') ?? true,
  );
  readonly showOpeningStockProductSearch = computed(
    () =>
      this.capabilityService?.canUseView('inventory.openingStock.features.productSearch') ?? true,
  );
  readonly showOpeningStockPackaging = computed(
    () =>
      this.capabilityService?.canViewField('inventory.openingStock.fields.packagingUnit') ?? true,
  );
  readonly showOpeningStockManufacturingDate = computed(
    () =>
      this.capabilityService?.canViewField('inventory.openingStock.fields.manufacturingDate') ??
      true,
  );
  readonly canPostOpeningStock = computed(
    () =>
      this.canUseOpeningStock() &&
      this.sessionStore.hasPermission('inventory.opening-stock.post') &&
      (this.capabilityService?.canPerformAction('inventory.openingStock.actions.post') ?? true),
  );
  readonly canPost = computed(
    () => this.canPostOpeningStock() && this.formValid() && !this.saving(),
  );
  private readonly formValid = signal(false);
  readonly showViewStockAction = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canPerformAction('inventory.openingStock.actions.viewStock') ??
        true),
  );

  readonly selectedProduct = signal<ProductRecord | null>(null);

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly infoTitle = 'About Opening Stock';
  readonly infoDescription =
    'Use Opening Stock when initializing a warehouse or onboarding existing inventory.';
  readonly infoItems = [
    'Creates the auditable starting quantity for the selected warehouse and product.',
    'Opening value establishes the starting cost basis through Agrivio’s authoritative workflow.',
    'Batch and expiry information follows the selected product’s tracking requirements.',
    'Normal later changes should use purchases, sales, returns, transfers or adjustments.',
  ];

  readonly form = this.formBuilder.nonNullable.group({
    warehouseId: ['', Validators.required],
    productId: ['', Validators.required],
    quantity: ['', inventoryQuantityValidators],
    packagingUnitId: [''],
    batchNumber: [''],
    manufacturingDate: [''],
    expiryDate: [''],
    inventoryValue: ['', inventoryMoneyValidators],
  });

  constructor() {
    this.formValid.set(this.form.valid);
    this.form.statusChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.formValid.set(this.form.valid);
    });

    this.form.controls.productId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((productId) => {
        const product =
          this.products().find((item) => item.id === productId) ??
          (this.selectedProduct()?.id === productId ? this.selectedProduct() : null);
        this.selectedProduct.set(product);
        const mode = product?.trackingMode ?? 'none';
        this.selectedTrackingMode.set(mode);
        this.syncTrackingRequired(mode);
        this.loadPackagingUnits(productId);
      });

    if (!this.canPostOpeningStock()) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      products: this.catalogApi.searchProductOptions(),
      warehouses: this.locationsApi.listWarehouseOptions(),
      history: this.inventoryApi.listOpeningStock({ page: this.page(), pageSize: this.pageSize(), status: 'draft' }),
    }).subscribe({
      next: ({ products, warehouses, history }) => {
        const activeProducts = products.filter((item) => item.status === 'active');
        const activeWarehouses = warehouses.filter((item) => item.status === 'active');
        this.products.set(activeProducts);
        this.warehouses.set(activeWarehouses);
        const soleWarehouse = activeWarehouses.length === 1 ? activeWarehouses[0] : undefined;
        if (soleWarehouse && !this.form.controls.warehouseId.value) {
          this.form.patchValue({ warehouseId: soleWarehouse.id });
        }
        this.recentOpeningStock.set(history.items);
        this.total.set(history.total);
        this.loading.set(false);

        const targetProductId = this.route?.snapshot?.queryParamMap?.get('productId');
        if (targetProductId) {
          this.applyTargetProduct(targetProductId);
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load opening stock form.'));
      },
    });

    this.route?.queryParamMap
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const targetProductId = params.get('productId');
        if (
          targetProductId &&
          targetProductId !== this.form.controls.productId.value &&
          !this.loading()
        ) {
          this.applyTargetProduct(targetProductId);
        }
      });

    this.productSearchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.catalogApi.searchProductOptions(query, 500, 'active')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.products.set(items.filter((item) => item.status === 'active'));
      });

    const recordId =
      this.route?.snapshot?.paramMap?.get('id') ??
      this.route?.snapshot?.queryParamMap?.get('draftId') ??
      this.route?.snapshot?.queryParamMap?.get('id');
    if (recordId) {
      this.loadOpeningStockRecord(recordId);
    }
  }

  loadOpeningStockRecord(id: string): void {
    this.inventoryApi.getOpeningStock(id).subscribe({
      next: (record) => {
        this.openingStockRecord.set(record);
        this.form.patchValue({
          warehouseId: record.warehouseId,
          productId: record.productId,
          quantity: record.quantity,
          packagingUnitId: record.packagingUnitId ?? '',
          batchNumber: record.batchNumber ?? '',
          manufacturingDate: record.manufacturingDate ?? '',
          expiryDate: record.expiryDate ?? '',
          inventoryValue: record.inventoryValue?.amount ?? '',
        });
        if (record.productId) {
          this.applyTargetProduct(record.productId);
        }
        if (record.status === 'posted') {
          this.form.disable();
          this.isEditing.set(false);
        } else {
          this.form.enable();
          this.isEditing.set(true);
        }
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error, 'Unable to load opening stock record.'));
      },
    });
  }

  productSelectedLabel(): string {
    return this.selectedProduct()?.name ?? '';
  }

  private loadPackagingUnits(productId: string): void {
    this.packagingUnits.set([]);
    this.form.patchValue({ packagingUnitId: '' });
    if (!productId || !this.showOpeningStockPackaging()) {
      return;
    }
    this.catalogApi.listPackagingUnits(productId).subscribe({
      next: (units) => {
        this.packagingUnits.set(units.filter((item) => item.status === 'active'));
      },
      error: () => {
        this.packagingUnits.set([]);
      },
    });
  }

  private applyTargetProduct(targetProductId: string): void {
    const existing = this.products().find((item) => item.id === targetProductId);
    if (existing) {
      this.selectedProduct.set(existing);
      const mode = existing.trackingMode ?? 'none';
      this.selectedTrackingMode.set(mode);
      this.syncTrackingRequired(mode);
      this.form.patchValue({ productId: targetProductId });
      this.loadPackagingUnits(targetProductId);
    } else {
      this.catalogApi.getProduct(targetProductId).subscribe({
        next: (product) => {
          if (product && product.status === 'active') {
            this.products.update((list) => {
              return list.some((p) => p.id === product.id) ? list : [product, ...list];
            });
            this.selectedProduct.set(product);
            const mode = product.trackingMode ?? 'none';
            this.selectedTrackingMode.set(mode);
            this.syncTrackingRequired(mode);
            this.form.patchValue({ productId: targetProductId });
            this.loadPackagingUnits(targetProductId);
          }
        },
        error: () => {
          // Keep current selection if product cannot be retrieved
        },
      });
    }
  }

  private syncTrackingRequired(mode: string): void {
    setRequiredValidator(this.form.controls.batchNumber, mode !== 'none');
    setRequiredValidator(this.form.controls.expiryDate, mode === 'batch_expiry');
  }

  formatTrackingLabel(mode?: string | null): string {
    if (mode === 'batch_expiry') return 'Batch + Expiry Tracked';
    if (mode === 'batch') return 'Batch Tracked';
    return 'Standard (None)';
  }

  buildPayload(): {
    warehouseId: string;
    productId: string;
    quantity: string;
    packagingUnitId?: string;
    batchNumber?: string;
    manufacturingDate?: string;
    expiryDate?: string;
    inventoryValue: { amount: string; currency: string };
  } {
    const value = this.form.getRawValue();
    const mode = this.selectedTrackingMode();
    const payload: {
      warehouseId: string;
      productId: string;
      quantity: string;
      packagingUnitId?: string;
      batchNumber?: string;
      manufacturingDate?: string;
      expiryDate?: string;
      inventoryValue: { amount: string; currency: string };
    } = {
      warehouseId: value.warehouseId,
      productId: value.productId,
      quantity: value.quantity.trim(),
      inventoryValue: { amount: value.inventoryValue.trim(), currency: 'PKR' },
    };
    if (value.packagingUnitId.trim() !== '') {
      payload.packagingUnitId = value.packagingUnitId;
    }
    if (mode !== 'none' && value.batchNumber.trim() !== '') {
      payload.batchNumber = value.batchNumber.trim();
    }
    if (value.manufacturingDate.trim() !== '') {
      payload.manufacturingDate = value.manufacturingDate.trim();
    }
    if (mode === 'batch_expiry' && value.expiryDate.trim() !== '') {
      payload.expiryDate = value.expiryDate.trim();
    }
    return payload;
  }

  enableEditing(): void {
    if (this.isPosted()) return;
    this.isEditing.set(true);
    this.form.enable();
  }

  openDiscardDialog(): void {
    const record = this.openingStockRecord();
    if (!this.canPostOpeningStock() || !record || record.status !== 'draft' || this.discarding()) return;
    this.pendingDiscard = record;
    this.discardDialogOpen.set(true);
  }

  askDiscardRow(record: OpeningStockRecord): void {
    if (!this.canPostOpeningStock() || record.status !== 'draft' || this.discarding()) return;
    this.pendingDiscard = record;
    this.discardDialogOpen.set(true);
  }

  onDiscardDismissed(): void {
    this.pendingDiscard = null;
    this.discardDialogOpen.set(false);
  }

  onDiscardConfirmed(): void {
    const record = this.pendingDiscard;
    if (!record || !this.canPostOpeningStock() || record.status !== 'draft' || this.discarding()) return;
    this.discarding.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.inventoryApi.discardOpeningStock(record.id, record.version).subscribe({
      next: () => {
        this.discarding.set(false);
        this.discardDialogOpen.set(false);
        this.openingStockRecord.set(null);
        this.form.reset({
          warehouseId: '',
          productId: '',
          quantity: '',
          packagingUnitId: '',
          batchNumber: '',
          manufacturingDate: '',
          expiryDate: '',
          inventoryValue: '',
        });
        this.selectedProduct.set(null);
        this.selectedTrackingMode.set('none');
        this.form.enable();
        this.isEditing.set(true);
        this.pendingDiscard = null;
        this.successMessage.set('Opening stock draft discarded successfully.');
        this.loadHistory();
      },
      error: (error: unknown) => {
        this.discarding.set(false);
        this.discardDialogOpen.set(false);
        this.pendingDiscard = null;
        this.errorMessage.set(this.mapConflictError(error, 'Unable to discard opening stock draft.'));
      },
    });
  }

  saveDraft(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    if (!this.canPostOpeningStock() || this.savingDraft()) return;
    const value = this.form.getRawValue();
    if (!value.warehouseId || !value.productId || !value.quantity) {
      this.errorMessage.set('Warehouse, product, and quantity are required to save draft.');
      return;
    }
    this.savingDraft.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const payload = this.buildPayload();
    const current = this.openingStockRecord();
    if (current && current.status === 'draft') {
      this.inventoryApi.updateOpeningStock(current.id, payload, current.version).subscribe({
        next: (updated) => {
          this.savingDraft.set(false);
          this.openingStockRecord.set(updated);
          this.successMessage.set('Opening stock draft updated successfully.');
          this.loadHistory();
        },
        error: (error: unknown) => {
          this.savingDraft.set(false);
          this.errorMessage.set(this.mapConflictError(error, 'Unable to update opening stock draft.'));
        },
      });
    } else {
      this.inventoryApi.createOpeningStockDraft(payload).subscribe({
        next: (created) => {
          this.savingDraft.set(false);
          this.openingStockRecord.set(created);
          this.successMessage.set('Opening stock draft saved successfully.');
          this.loadHistory();
        },
        error: (error: unknown) => {
          this.savingDraft.set(false);
          this.errorMessage.set(this.mapConflictError(error, 'Unable to create opening stock draft.'));
        },
      });
    }
  }

  submit(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    if (!this.canPost()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const payload = this.buildPayload();
    const current = this.openingStockRecord();
    const idempotencyKey = `opening-stock-${crypto.randomUUID()}`;

    if (current && current.status === 'draft') {
      this.inventoryApi.postOpeningStockDraft(current.id, current.version, idempotencyKey).subscribe({
        next: (result) => {
          this.saving.set(false);
          this.openingStockRecord.set({
            ...current,
            status: 'posted',
            version: current.version + 1,
          });
          this.form.disable();
          this.isEditing.set(false);
          this.successMessage.set(
            `Opening stock posted. Balance ${result.balance.quantityBase}; WAC ${result.costState.weightedAverageCost.amount} PKR.`,
          );
          this.loadHistory();
          this.scrollToTop();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapConflictError(error, 'Unable to post opening stock draft.'));
        },
      });
    } else {
      this.inventoryApi.postOpeningStock(payload, idempotencyKey).subscribe({
        next: (result) => {
          this.saving.set(false);
          this.form.disable();
          this.isEditing.set(false);
          this.successMessage.set(
            `Opening stock posted. Balance ${result.balance.quantityBase}; WAC ${result.costState.weightedAverageCost.amount} PKR.`,
          );
          this.loadHistory();
          this.scrollToTop();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapConflictError(error, 'Unable to post opening stock.'));
        },
      });
    }
  }

  private mapConflictError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        return 'Opening stock record was modified or is no longer a draft.';
      }
      const message = error.error?.error?.message ?? error.error?.message;
      if (typeof message === 'string' && message.trim() !== '') {
        return message;
      }
    }
    return fallback;
  }

  private mapError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.error?.message;
      if (typeof message === 'string' && message.trim() !== '') {
        return message;
      }
    }
    return fallback;
  }

  onProductSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.productSearchChanges.next(target.value.trim());
    }
  }

  onProductComboboxSearch(query: string): void {
    this.productSearchChanges.next(query.trim());
  }

  loadHistory(page = this.page(), pageSize = this.pageSize()): void {
    this.inventoryApi.listOpeningStock({ page, pageSize, status: 'draft' }).subscribe({
      next: (result) => {
        this.recentOpeningStock.set(result.items);
        this.total.set(result.total);
        this.page.set(result.page);
        this.pageSize.set(result.pageSize);
      },
      error: () => {
        // silently fail; list retains last known state
      },
    });
  }

  onPageChange(newPage: number): void {
    if (newPage === this.page() || this.loading()) return;
    this.loadHistory(newPage, this.pageSize());
  }

  onPageSizeChange(newSize: number): void {
    if (newSize === this.pageSize() || this.loading()) return;
    this.loadHistory(1, newSize);
  }

  editDraftRow(record: OpeningStockRecord): void {
    this.loadOpeningStockRecord(record.id);
    this.scrollToTop();
  }

  openPostDialog(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    if (!this.canPost()) {
      return;
    }
    this.pendingPost.set(null);
    this.postDialogOpen.set(true);
  }

  askPostRow(record: OpeningStockRecord): void {
    if (!this.canPostOpeningStock() || record.status !== 'draft') return;
    this.pendingPost.set(record);
    this.postDialogOpen.set(true);
  }

  postDraftRow(record: OpeningStockRecord): void {
    this.askPostRow(record);
  }

  onPostConfirmed(): void {
    this.postDialogOpen.set(false);
    const target = this.pendingPost();
    this.pendingPost.set(null);
    if (target) {
      this.executePostDraftRow(target);
    } else {
      this.submit();
    }
  }

  onPostDismissed(): void {
    this.pendingPost.set(null);
    this.postDialogOpen.set(false);
  }

  private executePostDraftRow(record: OpeningStockRecord): void {
    if (!this.canPostOpeningStock() || record.status !== 'draft') return;

    // If the currently edited draft is the one being posted, just trigger standard submit
    if (this.openingStockRecord()?.id === record.id) {
      this.submit();
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    const idempotencyKey = `opening-stock-post-${crypto.randomUUID()}`;

    this.inventoryApi.postOpeningStockDraft(record.id, record.version, idempotencyKey).subscribe({
      next: () => {
        this.successMessage.set('Opening stock posted successfully.');
        this.loadHistory();
        this.scrollToTop();
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapConflictError(error, 'Unable to post opening stock draft.'));
      },
    });
  }

  private scrollToTop(): void {
    if (typeof document !== 'undefined') {
      const shellContent = document.querySelector('.ag-shell__content');
      if (shellContent && typeof shellContent.scrollTo === 'function') {
        shellContent.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    const hostEl = this.elementRef?.nativeElement;
    if (hostEl && typeof hostEl.scrollIntoView === 'function') {
      hostEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  getProductName(id: string): string {
    return this.products().find((p) => p.id === id)?.name || id;
  }

  getProductSku(id: string): string | null {
    return this.products().find((p) => p.id === id)?.sku || null;
  }

  getWarehouseName(id: string): string {
    return this.warehouses().find((w) => w.id === id)?.name || id;
  }
}
