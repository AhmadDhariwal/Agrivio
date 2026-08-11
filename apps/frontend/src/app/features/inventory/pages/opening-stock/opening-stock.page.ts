import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi, WarehouseRecord } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { PackagingUnitRecord, ProductRecord } from '../../../catalog/models/catalog.models';

@Component({
  selector: 'agrivio-opening-stock-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
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

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly products = signal<ProductRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly packagingUnits = signal<PackagingUnitRecord[]>([]);
  readonly selectedTrackingMode = signal<string>('none');
  readonly canPost = computed(() =>
    this.sessionStore.hasPermission('inventory.opening-stock.post'),
  );

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
    if (!this.canPost()) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      products: this.catalogApi.listProducts(),
      warehouses: this.locationsApi.listWarehouses(),
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
      const product = this.products().find((item) => item.id === productId);
      this.selectedTrackingMode.set(product?.trackingMode ?? 'none');
      this.packagingUnits.set([]);
      this.form.patchValue({ packagingUnitId: '' });
      if (!productId) {
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
  }

  submit(): void {
    if (!this.canPost() || this.form.invalid) {
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
}
