import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  of,
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
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { lockBodyScroll, unlockBodyScroll } from '../../../../shared/ui/body-scroll-lock';
import { ProductBatchRecord, StockMovementRecord } from '../../models/inventory.models';
import { ProductRecord } from '../../../catalog/models/catalog.models';

export interface ResolvedProductInfo {
  name: string;
  sku: string;
  baseUnitCode?: string;
}

export interface ResolvedWarehouseInfo {
  name: string;
  code: string;
  location?: string;
}

export interface ResolvedBatchInfo {
  batchNumber: string;
  expiryDate: string | null;
}

@Component({
  selector: 'agrivio-movements-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './movements.page.html',
  styleUrl: './movements.page.scss',
})
export class MovementsPage {
  readonly infoTitle = 'About Stock Movements';
  readonly infoDescription =
    'All inventory changes are recorded here. Posted movements are immutable. Transfers, purchases, adjustments, and corrections create movements. Movements are the source of audit history.';
  readonly infoItems = [
    'Every stock receipt, transfer, sale, and adjustment creates an immutable audit movement.',
    'Posted movements cannot be permanently deleted, preserving inventory audit integrity.',
    'Weighted-average cost (WAC) and inventory valuation snapshots reflect state at posting time.',
    'Filter by product, warehouse, direction, and source type for detailed traceability.',
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
  readonly movements = signal<StockMovementRecord[]>([]);

  // Master Data & In-Memory Reference Caches
  readonly productMap = signal<Map<string, ProductRecord>>(new Map());
  readonly warehouseMap = signal<Map<string, WarehouseRecord>>(new Map());
  readonly batchMap = signal<Map<string, ProductBatchRecord>>(new Map());

  readonly productList = signal<ProductRecord[]>([]);
  readonly warehouseList = signal<WarehouseRecord[]>([]);

  // Filter Signals (Server-authoritative for warehouse/product, Client-side for direction/source/date/search)
  readonly search = signal<string>('');
  readonly warehouseFilter = signal<string>('');
  readonly productFilter = signal<string>('');
  readonly directionFilter = signal<string>('all');
  readonly sourceTypeFilter = signal<string>('all');
  readonly dateFilter = signal<'all' | '7d' | '30d' | '90d'>('all');

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
    return this.preferredViewMode();
  });

  // Mobile Filter Sheet
  readonly mobileFiltersOpen = signal<boolean>(false);

  // Inspector Drawer State
  readonly selectedMovement = signal<StockMovementRecord | null>(null);

  // Computed Authoritative KPIs
  readonly kpiTotalMovements = computed(() => this.total());
  readonly kpiInboundCount = computed(
    () => this.movements().filter((m) => m.direction === 'inbound').length,
  );
  readonly kpiOutboundCount = computed(
    () => this.movements().filter((m) => m.direction === 'outbound').length,
  );
  readonly kpiProductsCount = computed(
    () => new Set(this.movements().map((m) => m.productId)).size,
  );
  readonly kpiWarehousesCount = computed(
    () => new Set(this.movements().map((m) => m.warehouseId)).size,
  );
  readonly kpiProductsWarehousesLabel = computed(
    () => `${this.kpiProductsCount()} / ${this.kpiWarehousesCount()}`,
  );

  // Computed Filtered Movements
  readonly filteredMovements = computed(() => {
    let list = this.movements();
    const direction = this.directionFilter();
    const sourceType = this.sourceTypeFilter();
    const dateRange = this.dateFilter();
    const query = this.search().trim().toLowerCase();

    // Direction Filter
    if (direction && direction !== 'all') {
      list = list.filter((m) => m.direction === direction);
    }

    // Source Type Filter
    if (sourceType && sourceType !== 'all') {
      list = list.filter((m) => m.sourceType === sourceType);
    }

    // Date Filter (Client-side relative window)
    if (dateRange && dateRange !== 'all') {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      let maxAgeMs = 30 * dayMs;
      if (dateRange === '7d') maxAgeMs = 7 * dayMs;
      else if (dateRange === '30d') maxAgeMs = 30 * dayMs;
      else if (dateRange === '90d') maxAgeMs = 90 * dayMs;

      list = list.filter((m) => {
        const time = new Date(m.postedAt).getTime();
        return !isNaN(time) && now - time <= maxAgeMs;
      });
    }

    // Search Query Filter
    if (query) {
      list = list.filter((m) => {
        const prod = this.resolveProduct(m.productId);
        const wh = this.resolveWarehouse(m.warehouseId);
        const batch = this.resolveBatch(m.batchId);
        const sourceLabel = this.sourceTypeLabel(m.sourceType).toLowerCase();

        return (
          prod.name.toLowerCase().includes(query) ||
          prod.sku.toLowerCase().includes(query) ||
          wh.name.toLowerCase().includes(query) ||
          wh.code.toLowerCase().includes(query) ||
          batch.batchNumber.toLowerCase().includes(query) ||
          sourceLabel.includes(query) ||
          m.sourceType.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query)
        );
      });
    }

    return list;
  });

  // Permissions & Capability Computeds
  readonly canUseMovements = computed(() => true);
  readonly canView = computed(
    () => this.sessionStore.hasPermission('inventory.view') && this.canUseMovements(),
  );
  readonly canInspectMovement = computed(() => true);
  readonly canViewStock = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canUseModule('inventory.stock') ?? true),
  );
  readonly canViewBatches = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canUseModule('inventory.batches') ?? true),
  );
  readonly canViewProducts = computed(() => this.sessionStore.hasPermission('catalog.view'));

  readonly hasActiveFilters = computed(() => {
    return (
      Boolean(this.warehouseFilter()) ||
      Boolean(this.productFilter()) ||
      this.directionFilter() !== 'all' ||
      this.sourceTypeFilter() !== 'all' ||
      this.dateFilter() !== 'all' ||
      Boolean(this.search())
    );
  });

  readonly activeFiltersCount = computed(() => {
    let count = 0;
    if (this.warehouseFilter()) count++;
    if (this.productFilter()) count++;
    if (this.directionFilter() !== 'all') count++;
    if (this.sourceTypeFilter() !== 'all') count++;
    if (this.dateFilter() !== 'all') count++;
    if (this.search()) count++;
    return count;
  });

  constructor() {
    this.checkViewport();
    this.loadDropdownOptions();

    // Body scroll lock effect when inspector is opened
    effect((onCleanup) => {
      if (this.selectedMovement() || this.mobileFiltersOpen()) {
        lockBodyScroll();
      } else {
        unlockBodyScroll();
      }
      onCleanup(() => {
        unlockBodyScroll();
      });
    });

    // Debounced search handling
    this.searchChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.search.set(query);
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

          const query: {
            page: number;
            pageSize: number;
            warehouseId?: string;
            productId?: string;
          } = {
            page: this.page(),
            pageSize: this.pageSize(),
          };

          if (this.warehouseFilter()) {
            query.warehouseId = this.warehouseFilter();
          }
          if (this.productFilter()) {
            query.productId = this.productFilter();
          }

          return this.inventoryApi.listMovements(query).pipe(
            catchError(() => {
              this.loading.set(false);
              this.errorMessage.set('Unable to load stock movements.');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ items, meta }) => {
        this.movements.set(items);
        this.total.set(meta.total);
        this.loading.set(false);
        this.enrichMissingReferences(items);
      });
  }

  @HostListener('window:resize')
  checkViewport(): void {
    if (typeof window !== 'undefined') {
      this.isMobile.set(window.innerWidth < 768);
    }
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.selectedMovement()) {
      this.closeInspector();
    } else if (this.mobileFiltersOpen()) {
      this.closeMobileFilters();
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
    const select = event.target as HTMLSelectElement;
    this.warehouseFilter.set(select.value);
    this.page.set(1);
    this.reload();
  }

  onProductChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.productFilter.set(select.value);
    this.page.set(1);
    this.reload();
  }

  onDirectionChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.directionFilter.set(select.value);
  }

  onSourceTypeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.sourceTypeFilter.set(select.value);
  }

  onDateFilterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.dateFilter.set(select.value as 'all' | '7d' | '30d' | '90d');
  }

  setViewMode(mode: 'table' | 'cards'): void {
    this.preferredViewMode.set(mode);
  }

  clearFilters(): void {
    this.search.set('');
    this.searchChanges.next('');
    this.warehouseFilter.set('');
    this.productFilter.set('');
    this.directionFilter.set('all');
    this.sourceTypeFilter.set('all');
    this.dateFilter.set('all');
    this.page.set(1);
    this.reload();
  }

  openInspector(movement: StockMovementRecord): void {
    this.selectedMovement.set(movement);
  }

  closeInspector(): void {
    this.selectedMovement.set(null);
  }

  openMobileFilters(): void {
    this.mobileFiltersOpen.set(true);
  }

  closeMobileFilters(): void {
    this.mobileFiltersOpen.set(false);
  }

  // Reference Resolution Helpers
  resolveProduct(productId: string): ResolvedProductInfo {
    if (!productId) return { name: '—', sku: '—' };
    const p = this.productMap().get(productId);
    if (p) {
      return {
        name: p.name,
        sku: p.sku || '—',
        baseUnitCode: p.baseUnitCode,
      };
    }
    return {
      name: `Product (${productId.slice(-6)})`,
      sku: '—',
    };
  }

  resolveWarehouse(warehouseId: string): ResolvedWarehouseInfo {
    if (!warehouseId) return { name: '—', code: '—' };
    const w = this.warehouseMap().get(warehouseId);
    if (w) {
      return {
        name: w.name,
        code: w.code || '—',
        location: w.name,
      };
    }
    return {
      name: `Warehouse (${warehouseId.slice(-6)})`,
      code: warehouseId.slice(-6),
    };
  }

  resolveBatch(batchId: string | null): ResolvedBatchInfo {
    if (!batchId) return { batchNumber: '—', expiryDate: null };
    const b = this.batchMap().get(batchId);
    if (b) {
      return {
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
      };
    }
    return {
      batchNumber: batchId,
      expiryDate: null,
    };
  }

  sourceTypeLabel(sourceType: string): string {
    switch (sourceType) {
      case 'opening_stock':
        return 'Opening Stock';
      case 'stock_adjustment':
        return 'Stock Adjustment';
      case 'stock_adjustment_reversal':
        return 'Stock Adjustment (Reversal)';
      case 'warehouse_transfer':
        return 'Warehouse Transfer';
      case 'warehouse_transfer_reversal':
        return 'Warehouse Transfer (Reversal)';
      case 'purchase':
        return 'Purchase Receipt';
      case 'purchase_cancellation':
        return 'Purchase Cancellation';
      case 'purchase_return':
        return 'Purchase Return';
      case 'sale':
        return 'Sale / Dispatch';
      case 'sale_cancellation':
        return 'Sale Cancellation';
      case 'sales_return':
        return 'Sales Return';
      case 'purchase_return_reversal':
        return 'Purchase Return (Reversal)';
      case 'sales_return_reversal':
        return 'Sales Return (Reversal)';
      default:
        if (!sourceType) return '—';
        return sourceType
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
    }
  }

  formatPostedDate(isoString: string): { date: string; time: string } {
    if (!isoString) return { date: '—', time: '—' };
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return { date: isoString, time: '—' };
      const dateStr = d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timeStr = d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      return { date: dateStr, time: timeStr };
    } catch {
      return { date: isoString, time: '—' };
    }
  }

  formatCurrency(amount: string | null | undefined): string {
    if (amount === null || amount === undefined || amount === '') return '—';
    const num = Number(amount);
    if (isNaN(num)) return amount;
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private loadDropdownOptions(): void {
    this.catalogApi
      .searchProductOptions('', 500)
      .pipe(catchError(() => of([])))
      .subscribe((products) => {
        this.productList.set(products);
        const map = new Map(this.productMap());
        for (const p of products) {
          map.set(p.id, p);
        }
        this.productMap.set(map);
      });

    this.locationsApi
      .listWarehouseOptions()
      .pipe(catchError(() => of([])))
      .subscribe((warehouses) => {
        this.warehouseList.set(warehouses);
        const map = new Map(this.warehouseMap());
        for (const w of warehouses) {
          map.set(w.id, w);
        }
        this.warehouseMap.set(map);
      });
  }

  private enrichMissingReferences(items: StockMovementRecord[]): void {
    if (!items || items.length === 0) return;

    const missingProductIds = [...new Set(items.map((m) => m.productId))].filter(
      (id) => Boolean(id) && !this.productMap().has(id),
    );

    const missingWarehouseIds = [...new Set(items.map((m) => m.warehouseId))].filter(
      (id) => Boolean(id) && !this.warehouseMap().has(id),
    );

    const missingBatchIds = [
      ...new Set(items.map((m) => m.batchId).filter((id): id is string => Boolean(id))),
    ].filter((id) => !this.batchMap().has(id));

    if (
      missingProductIds.length === 0 &&
      missingWarehouseIds.length === 0 &&
      missingBatchIds.length === 0
    ) {
      return;
    }

    const productLookups = missingProductIds.map((id) =>
      this.catalogApi.getProduct(id).pipe(
        catchError(() =>
          of({
            id,
            organizationId: '',
            categoryId: '',
            name: `Product (${id.slice(-6)})`,
            sku: '—',
            trackingMode: 'none' as const,
            baseUnitCode: 'Units',
            measurementDimension: '',
            status: 'inactive' as const,
            version: 1,
          }),
        ),
      ),
    );

    const warehouseLookups = missingWarehouseIds.map((id) =>
      this.locationsApi.getWarehouse(id).pipe(
        catchError(() =>
          of({
            id,
            organizationId: '',
            name: `Warehouse (${id.slice(-6)})`,
            code: id.slice(-6),
            status: 'inactive' as const,
            version: 1,
          }),
        ),
      ),
    );

    const batchLookups = missingBatchIds.map((id) =>
      this.inventoryApi.getBatch(id).pipe(
        catchError(() =>
          of({
            id,
            organizationId: '',
            productId: '',
            batchNumber: id,
            manufacturingDate: null,
            expiryDate: null,
            firstReceivedAt: '',
          }),
        ),
      ),
    );

    forkJoin({
      products: productLookups.length > 0 ? forkJoin(productLookups) : of([]),
      warehouses: warehouseLookups.length > 0 ? forkJoin(warehouseLookups) : of([]),
      batches: batchLookups.length > 0 ? forkJoin(batchLookups) : of([]),
    }).subscribe({
      next: ({ products, warehouses, batches }) => {
        if (products.length > 0) {
          const nextP = new Map(this.productMap());
          for (const p of products) {
            nextP.set(p.id, p);
          }
          this.productMap.set(nextP);
        }
        if (warehouses.length > 0) {
          const nextW = new Map(this.warehouseMap());
          for (const w of warehouses) {
            nextW.set(w.id, w);
          }
          this.warehouseMap.set(nextW);
        }
        if (batches.length > 0) {
          const nextB = new Map(this.batchMap());
          for (const b of batches) {
            nextB.set(b.id, b);
          }
          this.batchMap.set(nextB);
        }
      },
    });
  }
}
