import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
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
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import {
  hasRequiredValidator,
  setRequiredValidator,
} from '../../../../shared/form/form-field.util';
import { PackagingUnitRecord, ProductRecord } from '../../../catalog/models/catalog.models';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-opening-stock-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
    UiModuleInfoComponent,
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly productSearchChanges = new Subject<string>();

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly products = signal<ProductRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly packagingUnits = signal<PackagingUnitRecord[]>([]);
  readonly selectedTrackingMode = signal<string>('none');
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
  readonly showViewStockAction = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canPerformAction('inventory.openingStock.actions.viewStock') ??
        true),
  );

  readonly selectedProduct = signal<ProductRecord | null>(null);

  readonly fieldRequired = hasRequiredValidator;

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
    quantity: ['', Validators.required],
    packagingUnitId: [''],
    batchNumber: [''],
    manufacturingDate: [''],
    expiryDate: [''],
    inventoryValue: ['', Validators.required],
  });

  constructor() {
    if (!this.canPostOpeningStock()) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      products: this.catalogApi.searchProductOptions(),
      warehouses: this.locationsApi.listWarehouseOptions(),
    }).subscribe({
      next: ({ products, warehouses }) => {
        this.products.set(products.filter((item) => item.status === 'active'));
        this.warehouses.set(warehouses.filter((item) => item.status === 'active'));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load opening stock form.'));
      },
    });

    this.form.controls.productId.valueChanges.subscribe((productId) => {
      const product = this.products().find((item) => item.id === productId) ?? null;
      this.selectedProduct.set(product);
      const mode = product?.trackingMode ?? 'none';
      this.selectedTrackingMode.set(mode);
      this.syncTrackingRequired(mode);
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

  submit(): void {
    if (!this.canPostOpeningStock() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
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

    const idempotencyKey = `opening-stock-${crypto.randomUUID()}`;
    this.inventoryApi.postOpeningStock(payload, idempotencyKey).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.successMessage.set(
          `Opening stock posted. Balance ${result.balance.quantityBase}; WAC ${result.costState.weightedAverageCost.amount} PKR.`,
        );
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to post opening stock.'));
      },
    });
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
}
