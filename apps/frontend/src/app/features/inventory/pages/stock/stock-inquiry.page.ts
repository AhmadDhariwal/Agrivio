import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { InventoryBalanceRecord } from '../../models/inventory.models';

@Component({
  selector: 'agrivio-stock-inquiry-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './stock-inquiry.page.html',
  styleUrl: './stock-inquiry.page.scss',
})
export class StockInquiryPage {
  private readonly inventoryApi = inject(InventoryApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly balances = signal<InventoryBalanceRecord[]>([]);
  readonly productNames = signal<Record<string, string>>({});
  readonly warehouseNames = signal<Record<string, string>>({});
  readonly canView = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canPostOpening = computed(() =>
    this.sessionStore.hasPermission('inventory.opening-stock.post'),
  );

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    forkJoin({
      balances: this.inventoryApi.listBalances(),
      products: this.catalogApi.listProducts(),
      warehouses: this.locationsApi.listWarehouses(),
    }).subscribe({
      next: ({ balances, products, warehouses }) => {
        const productMap: Record<string, string> = {};
        for (const product of products) {
          productMap[product.id] = product.name;
        }
        const warehouseMap: Record<string, string> = {};
        for (const warehouse of warehouses) {
          warehouseMap[warehouse.id] = warehouse.name;
        }
        this.productNames.set(productMap);
        this.warehouseNames.set(warehouseMap);
        this.balances.set(balances);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load stock balances.');
      },
    });
  }

  productLabel(id: string): string {
    return this.productNames()[id] ?? id;
  }

  warehouseLabel(id: string): string {
    return this.warehouseNames()[id] ?? id;
  }
}
