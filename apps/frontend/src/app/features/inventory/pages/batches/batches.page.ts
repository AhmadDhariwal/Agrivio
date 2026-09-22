import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
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
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { applyPaginationMeta } from '../../../../shared/data-access/pagination';
import { ExpiryInventoryRecord, ProductBatchRecord } from '../../models/inventory.models';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiSearchableDropdownComponent } from '../../../../shared/ui/ui-searchable-dropdown/ui-searchable-dropdown.component';
import {
  formatProductOption,
  formatWarehouseOption,
} from '../../../../shared/ui/ui-searchable-dropdown/entity-dropdown-formatters';
import { formatAppDate, formatAppDateTime } from '../../../../shared/format/date-time.util';

export interface BatchStatusInfo {
  label: string;
  tone: 'green' | 'amber' | 'red' | 'neutral';
}

export interface BatchLocationStock {
  warehouseId: string;
  warehouseName: string;
  warehouseCode?: string | undefined;
  quantityBase: string;
  unsellableQuantityBase: string;
}

@Component({
  selector: 'agrivio-batches-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
    UiSearchableDropdownComponent,
  ],
  templateUrl: './batches.page.html',
  styleUrl: './batches.page.scss',
})
export class BatchesPage {
  readonly infoTitle = 'About Product Batches';
  readonly infoDescription =
    'Track distinct product lots for inventory traceability, expiry control and stock movement history.';
  readonly infoItems = [
    'Each batch remains a distinct inventory identity.',
    'Batch tracking supports lot traceability from receipt through sale.',
    'Expiry information supports expiry-aware stock operations where configured.',
    'Stock quantity and valuation remain controlled by authoritative inventory workflows.',
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
  readonly batches = signal<ProductBatchRecord[]>([]);
  readonly productMap = signal<Map<string, ProductRecord>>(new Map());
  readonly warehouseMap = signal<Map<string, WarehouseRecord>>(new Map());
  readonly batchBalancesMap = signal<Map<string, BatchLocationStock[]>>(new Map());
  readonly expiryMap = signal<Map<string, ExpiryInventoryRecord>>(new Map());

  readonly productList = signal<ProductRecord[]>([]);
  readonly warehouseList = signal<WarehouseRecord[]>([]);

  readonly warehouseOptions = computed(() =>
    this.warehouseList().map((w) => formatWarehouseOption(w)),
  );
  readonly productOptions = computed(() =>
    this.productList().map((p) => formatProductOption(p)),
  );

  // Filter Signals (Server-authoritative)
  readonly search = signal<string>('');
  readonly productFilter = signal<string>('');
  readonly warehouseFilter = signal<string>('');

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
    if (!this.allowDesktopCards()) {
      return 'table';
    }
    return this.preferredViewMode();
  });

  // Mobile Filter Sheet State
  readonly mobileFiltersOpen = signal<boolean>(false);

  // Inspector Drawer State
  readonly selectedBatch = signal<ProductBatchRecord | null>(null);
  readonly technicalDetailsOpen = signal<boolean>(false);
  readonly openMenuBatchId = signal<string | null>(null);

  // Authoritative KPI Signals
  readonly expiringCount = signal<number>(0);
  readonly expiredCount = signal<number>(0);

  // Permission and organization-capability computeds
  readonly canUseBatches = computed(
    () => this.capabilityService?.canUseModule('inventory.batches') ?? true,
  );
  readonly canView = computed(
    () => this.sessionStore.hasPermission('inventory.view') && this.canUseBatches(),
  );
  readonly allowDesktopCards = computed(
    () => this.capabilityService?.canUseView('inventory.batches.views.desktopCards') ?? true,
  );
  readonly showBatchModuleInfo = computed(
    () => this.capabilityService?.canUseView('inventory.batches.features.moduleInfo') ?? true,
  );
  readonly showBatchTotalKpi = computed(
    () => this.capabilityService?.canShowWidget('inventory.batches.widgets.totalBatches') ?? true,
  );
  readonly showBatchExpiringKpi = computed(
    () =>
      this.canViewExpiry() &&
      (this.capabilityService?.canShowWidget('inventory.batches.widgets.expiringSoon') ?? true),
  );
  readonly showBatchExpiredKpi = computed(
    () =>
      this.canViewExpiry() &&
      (this.capabilityService?.canShowWidget('inventory.batches.widgets.expired') ?? true),
  );
  readonly showBatchWarehouseProductKpi = computed(
    () =>
      this.capabilityService?.canShowWidget('inventory.batches.widgets.warehouseProductSummary') ??
      true,
  );
  readonly showAnyBatchKpi = computed(
    () =>
      this.showBatchTotalKpi() ||
      this.showBatchExpiringKpi() ||
      this.showBatchExpiredKpi() ||
      this.showBatchWarehouseProductKpi(),
  );
  readonly showBatchSearch = computed(
    () => this.capabilityService?.canUseView('inventory.batches.features.search') ?? true,
  );
  readonly showBatchProductFilter = computed(
    () => this.capabilityService?.canUseView('inventory.batches.features.productFilter') ?? true,
  );
  readonly showBatchWarehouseFilter = computed(
    () => this.capabilityService?.canUseView('inventory.batches.features.warehouseFilter') ?? true,
  );
  readonly showAnyBatchFilter = computed(
    () =>
      this.showBatchSearch() || this.showBatchProductFilter() || this.showBatchWarehouseFilter(),
  );
  readonly showBatchLocations = computed(
    () => this.capabilityService?.canViewField('inventory.batches.fields.locations') ?? true,
  );
  readonly showBatchManufacture = computed(
    () => this.capabilityService?.canViewField('inventory.batches.fields.manufactureDate') ?? true,
  );
  readonly showBatchExpiry = computed(
    () => this.capabilityService?.canViewField('inventory.batches.fields.expiryDate') ?? true,
  );
  readonly showBatchFirstReceived = computed(
    () => this.capabilityService?.canViewField('inventory.batches.fields.firstReceived') ?? true,
  );
  readonly showBatchQuantity = computed(
    () =>
      this.capabilityService?.canViewField('inventory.batches.fields.availableQuantity') ?? true,
  );
  readonly showBatchStatus = computed(
    () => this.capabilityService?.canViewField('inventory.batches.fields.status') ?? true,
  );
  readonly showBatchStockByLocation = computed(
    () => this.capabilityService?.canUseView('inventory.batches.features.stockByLocation') ?? true,
  );
  readonly showBatchTechnicalDetails = computed(
    () => this.capabilityService?.canUseView('inventory.batches.features.technicalDetails') ?? true,
  );
  readonly canInspectBatch = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canPerformAction('inventory.batches.actions.inspect') ?? true),
  );
  readonly canViewStock = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canUseModule('inventory.stock') ?? true) &&
      (this.capabilityService?.canPerformAction('inventory.batches.actions.viewStock') ?? true),
  );
  readonly canViewMovements = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canPerformAction('inventory.batches.actions.viewMovements') ?? true),
  );
  readonly canViewExpiry = computed(() => this.sessionStore.hasPermission('inventory.expiry.view'));
  readonly canViewProducts = computed(
    () =>
      this.sessionStore.hasPermission('catalog.view') &&
      (this.capabilityService?.canUseModule('inventory.products') ?? true) &&
      (this.capabilityService?.canPerformAction('inventory.batches.actions.viewProduct') ?? true),
  );
  readonly hasBatchRowActions = computed(
    () =>
      this.canInspectBatch() ||
      this.canViewStock() ||
      this.canViewMovements() ||
      this.canViewProducts(),
  );
  readonly hasBatchOverflowActions = computed(
    () => this.canViewStock() || this.canViewMovements() || this.canViewProducts(),
  );

  readonly hasActiveFilters = computed(() => {
    return Boolean(this.search() || this.productFilter() || this.warehouseFilter());
  });

  readonly activeFiltersCount = computed(() => {
    let count = 0;
    if (this.search()) count++;
    if (this.productFilter()) count++;
    if (this.warehouseFilter()) count++;
    return count;
  });

  constructor() {
    this.checkViewport();
    this.loadReferenceData();

    // Debounced search handling
    this.searchChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.search.set(query.trim());
        this.page.set(1);
        this.reload();
      });

    // Primary list reload stream (batches only — reference data loads once above)
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

          return this.inventoryApi.listBatches(this.buildBatchQuery()).pipe(
            catchError(() => {
              this.loading.set(false);
              this.errorMessage.set('Unable to load product batches. Please try again.');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((batches) => {
        this.batches.set(batches.items);
        applyPaginationMeta(batches.meta, { total: this.total, pageSize: this.pageSize });
        this.syncBatchLocationMap(batches.items);
        this.loading.set(false);
      });
  }

  private syncBatchLocationMap(items: ProductBatchRecord[]): void {
    const whMap = this.warehouseMap();
    const locationMap = new Map<string, BatchLocationStock[]>();
    for (const batch of items) {
      if (!batch.stockLocations?.length) {
        continue;
      }
      locationMap.set(
        batch.id,
        batch.stockLocations.map((location) => ({
          warehouseId: location.warehouseId,
          warehouseName: whMap.get(location.warehouseId)?.name ?? location.warehouseId,
          warehouseCode: whMap.get(location.warehouseId)?.code,
          quantityBase: location.quantityBase,
          unsellableQuantityBase: location.unsellableQuantityBase,
        })),
      );
    }
    this.batchBalancesMap.set(locationMap);
  }

  private buildBatchQuery(): {
    page: number;
    pageSize: number;
    productId?: string;
    warehouseId?: string;
    search?: string;
  } {
    const batchQuery: {
      page: number;
      pageSize: number;
      productId?: string;
      warehouseId?: string;
      search?: string;
    } = {
      page: this.page(),
      pageSize: this.pageSize(),
    };

    if (this.productFilter()) {
      batchQuery.productId = this.productFilter();
    }
    if (this.warehouseFilter()) {
      batchQuery.warehouseId = this.warehouseFilter();
    }
    if (this.search()) {
      batchQuery.search = this.search();
    }

    return batchQuery;
  }

  private loadReferenceData(): void {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }

    const requests: {
      products: ReturnType<CatalogApi['searchProductOptions']>;
      warehouses: ReturnType<BranchesWarehousesApi['listWarehouseOptions']>;
      expiry?: ReturnType<InventoryApi['listExpiry']>;
    } = {
      products: this.catalogApi.searchProductOptions('', 500).pipe(catchError(() => of([]))),
      warehouses: this.locationsApi.listWarehouseOptions().pipe(catchError(() => of([]))),
    };

    if (this.canViewExpiry()) {
      requests.expiry = this.inventoryApi.listExpiry().pipe(
        catchError(() =>
          of({
            items: [] as ExpiryInventoryRecord[],
            businessDate: '',
            thresholdDays: 30,
          }),
        ),
      );
    }

    forkJoin(requests)
      .pipe(
        catchError(() => {
          this.errorMessage.set('Unable to load batch reference data. Please try again.');
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        const { products, warehouses } = result;

        const prodMap = new Map<string, ProductRecord>();
        for (const p of products) {
          const id = p.id || (p as unknown as { _id?: string })._id;
          if (id) prodMap.set(id, p);
        }
        this.productMap.set(prodMap);
        this.productList.set(products);

        const whMap = new Map<string, WarehouseRecord>();
        for (const w of warehouses) {
          const id = w.id || (w as unknown as { _id?: string })._id;
          if (id) whMap.set(id, w);
        }
        this.warehouseMap.set(whMap);
        this.warehouseList.set(warehouses);

        if ('expiry' in result && result.expiry) {
          const expResult = result.expiry as {
            items: ExpiryInventoryRecord[];
            thresholdDays: number;
          };
          const expMap = new Map<string, ExpiryInventoryRecord>();
          let upcoming = 0;
          let expired = 0;
          for (const item of expResult.items) {
            if (item.batchId) {
              expMap.set(item.batchId, item);
            }
            if (item.classification === 'expired') {
              expired++;
            } else if (item.classification === 'upcoming') {
              upcoming++;
            }
          }
          this.expiryMap.set(expMap);
          this.expiringCount.set(upcoming);
          this.expiredCount.set(expired);
        }
      });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.checkViewport();
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.openMenuBatchId()) {
      this.closeRowMenu();
    } else if (this.mobileFiltersOpen()) {
      this.closeMobileFilters();
    } else if (this.selectedBatch()) {
      this.closeInspector();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.openMenuBatchId()) {
      this.closeRowMenu();
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

  onProductChange(eventOrVal: Event | string | null): void {
    const val =
      typeof eventOrVal === 'string'
        ? eventOrVal
        : eventOrVal && 'target' in eventOrVal
          ? (eventOrVal.target as HTMLSelectElement).value
          : '';
    this.onProductSelected(val);
  }

  onProductSelected(val: string | null): void {
    this.productFilter.set(val || '');
    this.page.set(1);
    this.reload();
  }

  onWarehouseChange(eventOrVal: Event | string | null): void {
    const val =
      typeof eventOrVal === 'string'
        ? eventOrVal
        : eventOrVal && 'target' in eventOrVal
          ? (eventOrVal.target as HTMLSelectElement).value
          : '';
    this.onWarehouseSelected(val);
  }

  onWarehouseSelected(val: string | null): void {
    this.warehouseFilter.set(val || '');
    this.page.set(1);
    this.reload();
  }

  clearFilters(): void {
    this.search.set('');
    this.productFilter.set('');
    this.warehouseFilter.set('');
    this.page.set(1);
    this.reload();
  }

  setViewMode(mode: 'table' | 'cards'): void {
    if (mode === 'cards' && (this.isMobile() || !this.allowDesktopCards())) return;
    this.preferredViewMode.set(mode);
  }

  openMobileFilters(): void {
    this.mobileFiltersOpen.set(true);
  }

  closeMobileFilters(): void {
    this.mobileFiltersOpen.set(false);
  }

  openInspector(batch: ProductBatchRecord): void {
    if (!this.canInspectBatch()) return;
    this.selectedBatch.set(batch);
    this.technicalDetailsOpen.set(false);
  }

  closeInspector(): void {
    this.selectedBatch.set(null);
  }

  toggleTechnicalDetails(): void {
    this.technicalDetailsOpen.update((open) => !open);
  }

  toggleRowMenu(batchId: string, event: Event): void {
    event.stopPropagation();
    this.openMenuBatchId.update((current) => (current === batchId ? null : batchId));
  }

  closeRowMenu(): void {
    this.openMenuBatchId.set(null);
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

  getBatchLocations(batchId: string): BatchLocationStock[] {
    return this.batchBalancesMap().get(batchId) ?? [];
  }

  getBatchLocationSummary(batchId: string): string {
    const locs = this.getBatchLocations(batchId);
    if (locs.length === 0) return '—';
    const first = locs[0];
    if (!first) return '—';
    if (locs.length === 1) return first.warehouseName;
    return `${first.warehouseName} +${locs.length - 1}`;
  }

  getBatchTotalQuantity(batchId: string): {
    formatted: string;
    hasStock: boolean;
    unsellable: string | null;
  } {
    const locs = this.getBatchLocations(batchId);
    if (locs.length === 0) {
      return { formatted: '0', hasStock: false, unsellable: null };
    }
    let total = 0;
    let unsellable = 0;
    for (const l of locs) {
      const q = parseFloat(l.quantityBase || '0');
      const u = parseFloat(l.unsellableQuantityBase || '0');
      if (!isNaN(q)) total += q;
      if (!isNaN(u)) unsellable += u;
    }
    return {
      formatted: this.formatQuantity(total),
      hasStock: total > 0,
      unsellable: unsellable > 0 ? this.formatQuantity(unsellable) : null,
    };
  }

  formatDate(dateStr: string | null | undefined): string {
    return formatAppDate(dateStr);
  }

  formatDateTime(isoStr: string | null | undefined): string {
    return formatAppDate(isoStr);
  }

  formatDateTimeFull(isoStr: string | null | undefined): string {
    return formatAppDateTime(isoStr);
  }

  formatQuantity(quantity: string | number | undefined | null): string {
    if (quantity === undefined || quantity === null || quantity === '') return '0';
    const num = typeof quantity === 'number' ? quantity : parseFloat(quantity);
    if (isNaN(num)) return String(quantity);
    if (Number.isInteger(num)) {
      return num.toLocaleString('en-US');
    }
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }

  getBatchStatus(batch: ProductBatchRecord): BatchStatusInfo {
    const expItem = this.expiryMap().get(batch.id);
    if (expItem) {
      if (expItem.classification === 'expired') {
        return { label: 'Expired', tone: 'red' };
      }
      if (expItem.classification === 'upcoming') {
        return { label: 'Expiring Soon', tone: 'amber' };
      }
    }

    if (batch.expiryDate) {
      const expDate = new Date(batch.expiryDate);
      if (!isNaN(expDate.getTime())) {
        const now = new Date();
        const diffDays = Math.round((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          return { label: 'Expired', tone: 'red' };
        }
        if (diffDays <= 30) {
          return { label: 'Expiring Soon', tone: 'amber' };
        }
      }
    }

    return { label: 'Active', tone: 'green' };
  }
}
