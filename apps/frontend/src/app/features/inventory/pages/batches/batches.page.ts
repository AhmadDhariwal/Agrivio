import {
  Component,
  DestroyRef,
  HostListener,
  computed,
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

  // Permission Computeds
  readonly canView = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canViewStock = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canViewMovements = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly canViewExpiry = computed(() => this.sessionStore.hasPermission('inventory.expiry.view'));
  readonly canViewProducts = computed(() => this.sessionStore.hasPermission('catalog.view'));

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

    // Debounced search handling
    this.searchChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.search.set(query.trim());
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

          const requests: {
            batches: ReturnType<InventoryApi['listBatches']>;
            products: ReturnType<CatalogApi['searchProductOptions']>;
            warehouses: ReturnType<BranchesWarehousesApi['listWarehouseOptions']>;
            balances: ReturnType<InventoryApi['listBalances']>;
            expiry?: ReturnType<InventoryApi['listExpiry']>;
          } = {
            batches: this.inventoryApi.listBatches(batchQuery),
            products: this.catalogApi.searchProductOptions('', 100).pipe(catchError(() => of([]))),
            warehouses: this.locationsApi.listWarehouseOptions().pipe(catchError(() => of([]))),
            balances: this.inventoryApi
              .listBalances({ pageSize: 100 })
              .pipe(catchError(() => of({ items: [], meta: { page: 1, pageSize: 100, total: 0 } }))),
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

          return forkJoin(requests).pipe(
            catchError(() => {
              this.loading.set(false);
              this.errorMessage.set('Unable to load product batches. Please try again.');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        const { batches, products, warehouses, balances } = result;

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

        // Populate Batch Balances Map (by batchId)
        const bMap = new Map<string, BatchLocationStock[]>();
        for (const bal of balances.items) {
          if (bal.batchId) {
            const list = bMap.get(bal.batchId) ?? [];
            const wh = whMap.get(bal.warehouseId);
            list.push({
              warehouseId: bal.warehouseId,
              warehouseName: wh ? wh.name : bal.warehouseId,
              warehouseCode: wh?.code,
              quantityBase: bal.quantityBase ?? '0',
              unsellableQuantityBase: bal.unsellableQuantityBase ?? '0',
            });
            bMap.set(bal.batchId, list);
          }
        }
        this.batchBalancesMap.set(bMap);

        // Populate Expiry Map & Authoritative KPIs if available
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

        this.batches.set(batches.items);
        applyPaginationMeta(batches.meta, { total: this.total, pageSize: this.pageSize });
        this.loading.set(false);
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

  onProductChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.productFilter.set(target.value);
    this.page.set(1);
    this.reload();
  }

  onWarehouseChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.warehouseFilter.set(target.value);
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
    if (mode === 'cards' && this.isMobile()) return;
    this.preferredViewMode.set(mode);
  }

  openMobileFilters(): void {
    this.mobileFiltersOpen.set(true);
  }

  closeMobileFilters(): void {
    this.mobileFiltersOpen.set(false);
  }

  openInspector(batch: ProductBatchRecord): void {
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
    if (!dateStr) return '—';
    const trimmed = dateStr.trim();
    if (!trimmed) return '—';
    const parts = trimmed.split('-');
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(Date.UTC(year, monthIndex, day));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        });
      }
    }
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return trimmed;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  formatDateTime(isoStr: string | null | undefined): string {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  formatDateTimeFull(isoStr: string | null | undefined): string {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    return (
      d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) +
      ' ' +
      d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    );
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
        const diffDays = Math.round(
          (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
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
