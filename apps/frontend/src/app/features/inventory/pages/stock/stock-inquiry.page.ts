import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, forkJoin, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { InventoryBalanceRecord } from '../../models/inventory.models';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { applyPaginationMeta } from '../../../../shared/data-access/pagination';

@Component({
  selector: 'agrivio-stock-inquiry-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
  ],
  templateUrl: './stock-inquiry.page.html',
  styleUrl: './stock-inquiry.page.scss',
})
export class StockInquiryPage {
  private readonly inventoryApi = inject(InventoryApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef); private readonly reloadRequests = new Subject<void>();

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly balances = signal<InventoryBalanceRecord[]>([]);
  readonly productNames = signal<Record<string, string>>({});
  readonly warehouseNames = signal<Record<string, string>>({});
  readonly canView = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canPostOpening = computed(() =>
    this.sessionStore.hasPermission('inventory.opening-stock.post'),
  );
  readonly page = signal(1); readonly pageSize = signal(25); readonly total = signal(0);

  constructor() {
    this.reloadRequests.pipe(startWith(undefined), switchMap(() => {
      if (!this.canView()) { this.loading.set(false); return EMPTY; }
      this.loading.set(true); this.errorMessage.set(null);
      return forkJoin({
        balances: this.inventoryApi.listBalances({ page: this.page(), pageSize: this.pageSize() }),
        products: this.catalogApi.searchProductOptions(),
        warehouses: this.locationsApi.listWarehouseOptions(),
      }).pipe(catchError(() => { this.loading.set(false); this.errorMessage.set('Unable to load stock balances.'); return EMPTY; }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe(({ balances, products, warehouses }) => {
      const productMap: Record<string, string> = {}; for (const product of products) productMap[product.id] = product.name;
      const warehouseMap: Record<string, string> = {}; for (const warehouse of warehouses) warehouseMap[warehouse.id] = warehouse.name;
      this.productNames.set(productMap);
      this.warehouseNames.set(warehouseMap);
      this.balances.set(balances.items);
      applyPaginationMeta(balances.meta, { total: this.total, pageSize: this.pageSize });
      this.loading.set(false);
    });
  }

  reload(): void {
    this.reloadRequests.next();
  }
  onPageChange(page: number): void { this.page.set(page); this.reload(); }
  onPageSizeChange(size: number): void { this.pageSize.set(size); this.page.set(1); this.reload(); }

  productLabel(id: string): string {
    return this.productNames()[id] ?? id;
  }

  warehouseLabel(id: string): string {
    return this.warehouseNames()[id] ?? id;
  }
}
