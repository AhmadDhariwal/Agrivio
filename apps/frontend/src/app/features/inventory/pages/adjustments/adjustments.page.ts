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
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { StockAdjustmentRecord } from '../../models/inventory.models';

@Component({
  selector: 'agrivio-adjustments-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
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
  readonly products = signal<ProductRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly canAdjust = computed(() => this.sessionStore.hasPermission('inventory.adjust'));
  readonly canReverse = computed(() => this.sessionStore.hasPermission('inventory.adjust.reverse'));
  readonly canOverride = computed(() => this.sessionStore.hasPermission('inventory.negative-stock.override'));

  readonly form = this.formBuilder.nonNullable.group({
    warehouseId: ['', Validators.required],
    productId: ['', Validators.required],
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
      products: this.catalogApi.listProducts(),
      warehouses: this.locationsApi.listWarehouses(),
      adjustments: this.inventoryApi.listAdjustments(),
    }).subscribe({
      next: ({ products, warehouses, adjustments }) => {
        this.products.set(products.filter((item) => item.status === 'active'));
        this.warehouses.set(warehouses.filter((item) => item.status === 'active'));
        this.adjustments.set(adjustments);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load adjustments.');
      },
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
    const payload: Parameters<InventoryApi['createAdjustmentDraft']>[0] = {
      warehouseId: value.warehouseId,
      productId: value.productId,
      adjustmentType: value.adjustmentType,
      quantity: value.quantity,
      reason: value.reason,
    };
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
    this.inventoryApi
      .reverseAdjustment(
        adjustment.id,
        { reason: 'UI reversal' },
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

  private reloadAdjustments(): void {
    this.inventoryApi.listAdjustments().subscribe({
      next: (items) => this.adjustments.set(items),
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
