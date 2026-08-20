import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  startWith,
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
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { applyPaginationMeta } from '../../../../shared/data-access/pagination';
import {
  ExpiryInventoryRecord,
  InventoryBalanceRecord,
  ProductBatchRecord,
} from '../../models/inventory.models';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

export interface StockStatusInfo {
  label: string;
  tone: 'green' | 'amber' | 'red' | 'neutral';
}

@Component({
  selector: 'agrivio-stock-inquiry-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './stock-inquiry.page.html',
  styleUrl: './stock-inquiry.page.scss',
})
export class StockInquiryPage {
  readonly infoTitle = 'About Stock on Hand';
  readonly infoDescription =
    'Monitor live inventory balances, warehouse distributions, batch states, and WAC valuations.';
  readonly infoItems = [
    'View real-time stock quantities across all registered warehouses',
    'Inspect batch numbers, manufacturing dates, and expiry tracking',
    'Review weighted-average cost (WAC) and total inventory valuation in PKR',
    'Identify low-stock items, unsellable stock, and operational alerts',
  ];
  private readonly inventoryApi = inject(InventoryApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  private readonly reloadRequests = new Subject<void>();
  private readonly searchChanges = new Subject<string>();

  // Data Signals
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly balances = signal<InventoryBalanceRecord[]>([]);
  readonly productMap = signal<Map<string, ProductRecord>>(new Map());
  readonly warehouseMap = signal<Map<string, WarehouseRecord>>(new Map());
  readonly batchMap = signal<Map<string, ProductBatchRecord>>(new Map());
  readonly expiryMap = signal<Map<string, ExpiryInventoryRecord>>(new Map());

  readonly productList = signal<ProductRecord[]>([]);
  readonly warehouseList = signal<WarehouseRecord[]>([]);
  readonly batchList = signal<ProductBatchRecord[]>([]);

  // Filter Signals (Server-authoritative)
  readonly warehouseFilter = signal<string>('');
  readonly productFilter = signal<string>('');
  readonly batchFilter = signal<string>('');
  readonly search = signal<string>('');

  // Pagination Signals
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);

  // Responsive View Mode
  readonly preferredViewMode = signal<'table' | 'cards'>('table');
  readonly isMobile = signal<boolean>(false);
  readonly effectiveViewMode = computed<'table' | 'cards'>(() => {
    if (this.isMobile()) {
      return 'cards';
    }
    return this.allowDesktopCards() ? this.preferredViewMode() : 'table';
  });

  // Mobile Filter Sheet
  readonly mobileFiltersOpen = signal<boolean>(false);

  // Inspector Drawer State
  readonly selectedBalance = signal<InventoryBalanceRecord | null>(null);

  // Authoritative KPI Signals
  readonly warehousesCount = computed(() => this.warehouseList().length);
  readonly productsCount = computed(() => this.productList().length);
  readonly expiringCount = signal<number>(0);

  // Permission Computeds
  readonly canUseInventoryStock = computed(
    () => this.capabilityService?.canUseModule('inventory.stock') ?? true,
  );
  readonly canView = computed(
    () => this.sessionStore.hasPermission('inventory.view') && this.canUseInventoryStock(),
  );
  readonly canPostOpening = computed(
    () =>
      this.sessionStore.hasPermission('inventory.opening-stock.post') &&
      (this.capabilityService?.canUseModule('inventory.openingStock') ?? true) &&
      (this.capabilityService?.canPerformAction('inventory.openingStock.actions.post') ?? true),
  );
  readonly canViewExpiry = computed(() => this.sessionStore.hasPermission('inventory.expiry.view'));
  readonly canViewMovements = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canViewBatches = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canViewProducts = computed(() => this.sessionStore.hasPermission('catalog.view'));
  readonly allowDesktopCards = computed(
    () => this.capabilityService?.canUseView('inventory.stock.views.desktopCards') ?? true,
  );
  readonly showStockRecordsWidget = computed(
    () => this.capabilityService?.canShowWidget('inventory.stock.widgets.stockRecords') ?? true,
  );
  readonly showActiveWarehousesWidget = computed(
    () => this.capabilityService?.canShowWidget('inventory.stock.widgets.activeWarehouses') ?? true,
  );
  readonly showCatalogProductsWidget = computed(
    () => this.capabilityService?.canShowWidget('inventory.stock.widgets.catalogProducts') ?? true,
  );
  readonly showExpiringExpiredWidget = computed(
    () =>
      (this.capabilityService?.canShowWidget('inventory.stock.widgets.expiringExpired') ?? true) &&
      this.canViewExpiry(),
  );
  readonly showAnyWidget = computed(
    () =>
      this.showStockRecordsWidget() ||
      this.showActiveWarehousesWidget() ||
      this.showCatalogProductsWidget() ||
      this.showExpiringExpiredWidget(),
  );
  readonly showSearch = computed(
    () => this.capabilityService?.canUseView('inventory.stock.features.search') ?? true,
  );
  readonly showWarehouseFilter = computed(
    () => this.capabilityService?.canUseView('inventory.stock.features.warehouseFilter') ?? true,
  );
  readonly showProductFilter = computed(
    () => this.capabilityService?.canUseView('inventory.stock.features.productFilter') ?? true,
  );
  readonly showAnyFilter = computed(
    () => this.showSearch() || this.showWarehouseFilter() || this.showProductFilter(),
  );
  readonly showWarehouse = computed(
    () => this.capabilityService?.canViewField('inventory.stock.fields.warehouse') ?? true,
  );
  readonly showBatch = computed(
    () => this.capabilityService?.canViewField('inventory.stock.fields.batch') ?? true,
  );
  readonly showWac = computed(
    () => this.capabilityService?.canViewField('inventory.stock.fields.wac') ?? true,
  );
  readonly showInventoryValue = computed(
    () => this.capabilityService?.canViewField('inventory.stock.fields.inventoryValue') ?? true,
  );
  readonly showStatus = computed(
    () => this.capabilityService?.canViewField('inventory.stock.fields.status') ?? true,
  );
  readonly showInspectorIdentitySection = computed(
    () => this.capabilityService?.canUseView('inventory.stock.features.identitySection') ?? true,
  );
  readonly showInspectorQuantitySection = computed(
    () => this.capabilityService?.canUseView('inventory.stock.features.quantitySection') ?? true,
  );
  readonly showInspectorValuationSection = computed(
    () => this.capabilityService?.canUseView('inventory.stock.features.valuationSection') ?? true,
  );
  readonly showInspectorTrackingSection = computed(
    () => this.capabilityService?.canUseView('inventory.stock.features.trackingSection') ?? true,
  );
  readonly canInspectStock = computed(
    () => this.capabilityService?.canPerformAction('inventory.stock.actions.inspect') ?? true,
  );

  readonly hasActiveFilters = computed(() => {
    return (
      !!this.warehouseFilter() || !!this.productFilter() || !!this.batchFilter() || !!this.search()
    );
  });

  readonly activeFiltersCount = computed(() => {
    let count = 0;
    if (this.warehouseFilter()) count++;
    if (this.productFilter()) count++;
    if (this.batchFilter()) count++;
    if (this.search()) count++;
    return count;
  });

  constructor() {
    this.checkViewport();

    // Debounced search handling
    this.searchChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.search.set(query);
        // Find matching product if query matches SKU or name
        if (query.trim()) {
          const lower = query.trim().toLowerCase();
          const match = this.productList().find(
            (p) =>
              p.name.toLowerCase().includes(lower) ||
              (p.sku && p.sku.toLowerCase().includes(lower)),
          );
          if (match) {
            this.productFilter.set(match.id);
          } else {
            // Keep productFilter as is or reset if non-matching
            this.productFilter.set('');
          }
        } else {
          this.productFilter.set('');
        }
        this.page.set(1);
        this.reload();
      });

    // Primary data reload stream
    this.reloadRequests
      .pipe(
        startWith(undefined),
        switchMap(() => {
          if (!this.canView()) {
            this.loading.set(false);
            return EMPTY;
          }
          this.loading.set(true);
          this.errorMessage.set(null);

          const balanceQuery: {
            page: number;
            pageSize: number;
            warehouseId?: string;
            productId?: string;
            batchId?: string;
          } = {
            page: this.page(),
            pageSize: this.pageSize(),
          };

          if (this.warehouseFilter()) {
            balanceQuery.warehouseId = this.warehouseFilter();
          }
          if (this.productFilter()) {
            balanceQuery.productId = this.productFilter();
          }
          if (this.batchFilter()) {
            balanceQuery.batchId = this.batchFilter();
          }

          const requests: {
            balances: ReturnType<InventoryApi['listBalances']>;
            products: ReturnType<CatalogApi['searchProductOptions']>;
            warehouses: ReturnType<BranchesWarehousesApi['listWarehouseOptions']>;
            batches: ReturnType<InventoryApi['listBatches']>;
            expiry?: ReturnType<InventoryApi['listExpiry']>;
          } = {
            balances: this.inventoryApi.listBalances(balanceQuery),
            products: this.catalogApi.searchProductOptions('', 100),
            warehouses: this.locationsApi.listWarehouseOptions(),
            batches: this.inventoryApi.listBatches({ page: 1, pageSize: 100 }),
          };

          if (this.canViewExpiry()) {
            requests.expiry = this.inventoryApi.listExpiry();
          }

          return forkJoin(requests).pipe(
            catchError(() => {
              this.loading.set(false);
              this.errorMessage.set('Unable to load stock balances. Please try again.');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        const { balances, products, warehouses, batches } = result;

        // Populate Product Map
        const prodMap = new Map<string, ProductRecord>();
        for (const p of products) {
          prodMap.set(p.id, p);
        }
        this.productMap.set(prodMap);
        this.productList.set(products);

        // Populate Warehouse Map
        const whMap = new Map<string, WarehouseRecord>();
        for (const w of warehouses) {
          whMap.set(w.id, w);
        }
        this.warehouseMap.set(whMap);
        this.warehouseList.set(warehouses);

        // Populate Batch Map
        const bMap = new Map<string, ProductBatchRecord>();
        for (const b of batches.items) {
          bMap.set(b.id, b);
        }
        this.batchMap.set(bMap);
        this.batchList.set(batches.items);

        // Populate Expiry Map & Authoritative KPI if available
        if ('expiry' in result && result.expiry) {
          const expResult = result.expiry as {
            items: ExpiryInventoryRecord[];
            thresholdDays: number;
          };
          const expMap = new Map<string, ExpiryInventoryRecord>();
          let expiringOrExpiredCount = 0;
          for (const item of expResult.items) {
            const key = `${item.warehouseId}_${item.productId}_${item.batchId ?? 'null'}`;
            expMap.set(key, item);
            if (item.classification === 'expired' || item.classification === 'upcoming') {
              expiringOrExpiredCount++;
            }
          }
          this.expiryMap.set(expMap);
          this.expiringCount.set(expiringOrExpiredCount);
        }

        this.balances.set(balances.items);
        applyPaginationMeta(balances.meta, { total: this.total, pageSize: this.pageSize });
        this.loading.set(false);
      });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.checkViewport();
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.mobileFiltersOpen()) {
      this.closeMobileFilters();
    } else if (this.selectedBalance()) {
      this.closeInspector();
    }
  }

  private checkViewport(): void {
    if (typeof window !== 'undefined') {
      this.isMobile.set(window.innerWidth < 768);
    }
  }

  reload(): void {
    this.reloadRequests.next();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.reload();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.reload();
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchChanges.next(input.value);
  }

  onSearchClear(): void {
    this.search.set('');
    this.searchChanges.next('');
  }

  onWarehouseChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.warehouseFilter.set(target.value);
    this.page.set(1);
    this.reload();
  }

  onProductChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.productFilter.set(target.value);
    this.page.set(1);
    this.reload();
  }

  onBatchChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.batchFilter.set(target.value);
    this.page.set(1);
    this.reload();
  }

  clearFilters(): void {
    this.warehouseFilter.set('');
    this.productFilter.set('');
    this.batchFilter.set('');
    this.search.set('');
    this.page.set(1);
    this.reload();
  }

  setViewMode(mode: 'table' | 'cards'): void {
    if (mode === 'cards' && !this.isMobile() && !this.allowDesktopCards()) return;
    this.preferredViewMode.set(mode);
  }

  openMobileFilters(): void {
    this.mobileFiltersOpen.set(true);
  }

  closeMobileFilters(): void {
    this.mobileFiltersOpen.set(false);
  }

  selectBalance(row: InventoryBalanceRecord): void {
    if (!this.canInspectStock()) return;
    this.selectedBalance.set(row);
  }

  closeInspector(): void {
    this.selectedBalance.set(null);
  }

  // Label & Lookup Helpers (Authoritative, Zero N+1)
  productName(productId: string): string {
    return this.productMap().get(productId)?.name ?? productId;
  }

  productSku(productId: string): string | null {
    const sku = this.productMap().get(productId)?.sku;
    return sku && sku.trim() !== '' ? sku : null;
  }

  productBaseUnit(productId: string): string {
    return this.productMap().get(productId)?.baseUnitCode ?? '';
  }

  productTrackingMode(productId: string): string {
    return this.productMap().get(productId)?.trackingMode ?? 'none';
  }

  warehouseName(warehouseId: string): string {
    return this.warehouseMap().get(warehouseId)?.name ?? warehouseId;
  }

  warehouseCode(warehouseId: string): string | null {
    const code = this.warehouseMap().get(warehouseId)?.code;
    return code && code.trim() !== '' ? code : null;
  }

  batchNumber(batchId: string | null): string {
    if (!batchId) return '—';
    return this.batchMap().get(batchId)?.batchNumber ?? batchId;
  }

  batchExpiry(batchId: string | null): string | null {
    if (!batchId) return null;
    return this.batchMap().get(batchId)?.expiryDate ?? null;
  }

  hasUnsellable(row: InventoryBalanceRecord): boolean {
    const raw = row.unsellableQuantityBase;
    if (!raw) return false;
    const num = Number(raw);
    return !isNaN(num) && num > 0;
  }

  unsellableQuantity(row: InventoryBalanceRecord): string {
    return row.unsellableQuantityBase ?? '0.0000';
  }

  // Formatting Helpers (Tabular financial & high-precision stock numbers)
  formatMoney(amount: string | number | undefined | null): string {
    if (amount === undefined || amount === null || amount === '') return '0.00';
    const num = Number(amount);
    if (isNaN(num)) return String(amount);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatQuantity(quantity: string | number | undefined | null): string {
    if (quantity === undefined || quantity === null || quantity === '') return '0.0000';
    const raw = String(quantity).trim();
    const parts = raw.split('.');
    const intNum = Number(parts[0]);
    const intFormatted = isNaN(intNum) ? parts[0] : intNum.toLocaleString('en-US');
    if (parts.length > 1) {
      return `${intFormatted}.${parts[1]}`;
    }
    return `${intFormatted}.0000`;
  }

  stockStatus(row: InventoryBalanceRecord): StockStatusInfo {
    // Check expiry if tracked
    if (row.batchId) {
      const expItem = this.expiryMap().get(`${row.warehouseId}_${row.productId}_${row.batchId}`);
      if (expItem) {
        if (expItem.classification === 'expired') {
          return { label: 'Expired', tone: 'red' };
        }
        if (expItem.classification === 'upcoming') {
          return { label: 'Expiring Soon', tone: 'amber' };
        }
      }
    }

    const qty = Number(row.quantityBase);
    if (isNaN(qty) || qty === 0) {
      return { label: 'Out of Stock', tone: 'neutral' };
    }
    if (qty < 0) {
      return { label: 'Negative Stock', tone: 'red' };
    }
    return { label: 'In Stock', tone: 'green' };
  }
}
