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
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import {
  ExpiryInventoryRecord,
  ProductBatchRecord,
} from '../../models/inventory.models';
import { ProductRecord } from '../../../catalog/models/catalog.models';

export interface ExpiryClassificationInfo {
  label: string;
  tone: 'green' | 'amber' | 'red' | 'neutral';
}

export type ExpirySortField =
  | 'expiryDate'
  | 'batchNumber'
  | 'product'
  | 'warehouse'
  | 'quantityBase'
  | 'classification';

@Component({
  selector: 'agrivio-expiry-inquiry-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './expiry-inquiry.page.html',
  styleUrl: './expiry-inquiry.page.scss',
})
export class ExpiryInquiryPage {
  readonly infoTitle = 'About Expiry Inquiry';
  readonly infoDescription =
    'Review tracked inventory approaching or past its expiry date and identify stock requiring attention.';
  readonly infoItems = [
    "Expiry is evaluated against Agrivio's authoritative business date and configured window.",
    'Each record remains tied to its real Product batch identity.',
    'Upcoming stock can be reviewed before it reaches expiry.',
    'Expired stock remains subject to existing inventory/sales approval and traceability rules.',
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
  readonly rawItems = signal<ExpiryInventoryRecord[]>([]);
  readonly businessDate = signal<string>('');
  readonly thresholdDays = signal<number>(30);

  // Authoritative Relation Maps
  readonly productMap = signal<Map<string, ProductRecord>>(new Map());
  readonly warehouseMap = signal<Map<string, WarehouseRecord>>(new Map());
  readonly batchMap = signal<Map<string, ProductBatchRecord>>(new Map());

  readonly productList = signal<ProductRecord[]>([]);
  readonly warehouseList = signal<WarehouseRecord[]>([]);

  // Filter Signals
  readonly search = signal<string>('');
  readonly productFilter = signal<string>('');
  readonly warehouseFilter = signal<string>('');
  readonly classificationFilter = signal<string>('');

  // Sorting Signals
  readonly sortField = signal<ExpirySortField>('expiryDate');
  readonly sortOrder = signal<'asc' | 'desc'>('asc');

  // Pagination Signals
  readonly page = signal(1);
  readonly pageSize = signal(25);

  // Responsive View Mode
  readonly preferredViewMode = signal<'table' | 'cards'>('table');
  readonly isMobile = signal<boolean>(false);

  // Capability Computeds — module and view
  readonly canUseExpiry = computed(
    () => this.capabilityService?.canUseModule('inventory.expiry') ?? true,
  );
  readonly allowDesktopCards = computed(
    () => this.capabilityService?.canUseView('inventory.expiry.views.desktopCards') ?? true,
  );

  // Capability Computeds — widgets
  readonly showTotalRecordsKpi = computed(
    () => this.capabilityService?.canShowWidget('inventory.expiry.widgets.totalRecords') ?? true,
  );
  readonly showExpiringSoonKpi = computed(
    () => this.capabilityService?.canShowWidget('inventory.expiry.widgets.expiringSoon') ?? true,
  );
  readonly showExpiredKpi = computed(
    () => this.capabilityService?.canShowWidget('inventory.expiry.widgets.expired') ?? true,
  );
  readonly showTrackedProductsKpi = computed(
    () =>
      this.capabilityService?.canShowWidget('inventory.expiry.widgets.trackedProductsWarehouses') ??
      true,
  );
  readonly showAnyKpi = computed(
    () =>
      this.showTotalRecordsKpi() ||
      this.showExpiringSoonKpi() ||
      this.showExpiredKpi() ||
      this.showTrackedProductsKpi(),
  );

  // Capability Computeds — features (module info + filters)
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseModule('inventory.expiry.features.moduleInfo') ?? true,
  );
  readonly showSearch = computed(
    () => this.capabilityService?.canUseModule('inventory.expiry.features.search') ?? true,
  );
  readonly showProductFilter = computed(
    () => this.capabilityService?.canUseModule('inventory.expiry.features.productFilter') ?? true,
  );
  readonly showWarehouseFilter = computed(
    () => this.capabilityService?.canUseModule('inventory.expiry.features.warehouseFilter') ?? true,
  );
  readonly showClassificationFilter = computed(
    () =>
      this.capabilityService?.canUseModule('inventory.expiry.features.classificationFilter') ?? true,
  );

  // Capability Computeds — optional fields (required fields are always shown)
  readonly showWarehouseField = computed(
    () => this.capabilityService?.canViewField('inventory.expiry.fields.warehouse') ?? true,
  );
  readonly showQuantityField = computed(
    () => this.capabilityService?.canViewField('inventory.expiry.fields.quantity') ?? true,
  );

  // Capability Computeds — inspector sections
  // Field visibility dominates: the quantity section is suppressed when quantity field is hidden.
  readonly showTimelineSection = computed(
    () =>
      this.capabilityService?.canUseModule('inventory.expiry.features.timelineSection') ?? true,
  );
  readonly showQuantitySection = computed(
    () =>
      this.showQuantityField() &&
      (this.capabilityService?.canUseModule('inventory.expiry.features.quantitySection') ?? true),
  );
  readonly showTechnicalDetails = computed(
    () =>
      this.capabilityService?.canUseModule('inventory.expiry.features.technicalDetails') ?? true,
  );

  // Capability Computeds — actions (RBAC + capability)
  readonly canInspect = computed(
    () => this.capabilityService?.canPerformAction('inventory.expiry.actions.inspect') ?? true,
  );
  readonly canViewBatch = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canPerformAction('inventory.expiry.actions.viewBatch') ?? true),
  );
  readonly canViewProduct = computed(
    () =>
      this.sessionStore.hasPermission('catalog.view') &&
      (this.capabilityService?.canPerformAction('inventory.expiry.actions.viewProduct') ?? true),
  );
  readonly canViewStock = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canPerformAction('inventory.expiry.actions.viewStock') ?? true),
  );
  readonly canViewMovements = computed(
    () =>
      this.sessionStore.hasPermission('inventory.view') &&
      (this.capabilityService?.canPerformAction('inventory.expiry.actions.viewMovements') ?? true),
  );

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
  readonly selectedItem = signal<ExpiryInventoryRecord | null>(null);
  readonly technicalDetailsOpen = signal<boolean>(false);
  readonly openMenuBatchId = signal<string | null>(null);

  // Permission Computeds
  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('inventory.expiry.view') && this.canUseExpiry(),
  );
  readonly canViewBatches = computed(
    () => this.sessionStore.hasPermission('inventory.view'),
  );
  readonly canViewProducts = computed(
    () => this.sessionStore.hasPermission('catalog.view'),
  );

  // Authoritative KPI Computeds (Across entire organization scope)
  readonly totalRecordsCount = computed(() => this.rawItems().length);
  readonly expiringSoonCount = computed(
    () =>
      this.rawItems().filter((item) => item.classification === 'upcoming')
        .length,
  );
  readonly expiredCount = computed(
    () =>
      this.rawItems().filter((item) => item.classification === 'expired').length,
  );
  readonly trackedProductsCount = computed(
    () => new Set(this.rawItems().map((item) => item.productId)).size,
  );
  readonly trackedWarehousesCount = computed(
    () => new Set(this.rawItems().map((item) => item.warehouseId)).size,
  );

  // Active Filter Computeds
  readonly hasActiveFilters = computed(() => {
    return Boolean(
      this.search() ||
        this.productFilter() ||
        this.warehouseFilter() ||
        this.classificationFilter(),
    );
  });

  readonly activeFiltersCount = computed(() => {
    let count = 0;
    if (this.search()) count++;
    if (this.productFilter()) count++;
    if (this.warehouseFilter()) count++;
    if (this.classificationFilter()) count++;
    return count;
  });

  // Filtered Items
  readonly filteredItems = computed(() => {
    const q = this.search().toLowerCase().trim();
    const pFilter = this.productFilter();
    const wFilter = this.warehouseFilter();
    const cFilter = this.classificationFilter();
    const pMap = this.productMap();
    const wMap = this.warehouseMap();

    return this.rawItems().filter((item) => {
      if (pFilter && item.productId !== pFilter) {
        return false;
      }
      if (wFilter && item.warehouseId !== wFilter) {
        return false;
      }
      if (cFilter && item.classification !== cFilter) {
        return false;
      }
      if (q) {
        const batchNum = (item.batchNumber ?? '').toLowerCase();
        const prod = pMap.get(item.productId);
        const prodName = (prod?.name ?? '').toLowerCase();
        const prodSku = (prod?.sku ?? '').toLowerCase();
        const wh = wMap.get(item.warehouseId);
        const whName = (wh?.name ?? '').toLowerCase();
        const whCode = (wh?.code ?? '').toLowerCase();

        const matches =
          batchNum.includes(q) ||
          prodName.includes(q) ||
          prodSku.includes(q) ||
          whName.includes(q) ||
          whCode.includes(q);

        if (!matches) {
          return false;
        }
      }
      return true;
    });
  });

  // Sorted Items (Default: earliest expiry first)
  readonly sortedItems = computed(() => {
    const items = [...this.filteredItems()];
    const field = this.sortField();
    const order = this.sortOrder();
    const factor = order === 'asc' ? 1 : -1;
    const pMap = this.productMap();
    const wMap = this.warehouseMap();

    return items.sort((a, b) => {
      if (field === 'expiryDate') {
        // Priority order for expiry: expired stock first, then upcoming nearest, then normal
        const aDate = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
        const bDate = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
        return (aDate - bDate) * factor;
      }
      if (field === 'batchNumber') {
        const aVal = a.batchNumber ?? '';
        const bVal = b.batchNumber ?? '';
        return aVal.localeCompare(bVal) * factor;
      }
      if (field === 'product') {
        const aName = pMap.get(a.productId)?.name ?? a.productId;
        const bName = pMap.get(b.productId)?.name ?? b.productId;
        return aName.localeCompare(bName) * factor;
      }
      if (field === 'warehouse') {
        const aName = wMap.get(a.warehouseId)?.name ?? a.warehouseId;
        const bName = wMap.get(b.warehouseId)?.name ?? b.warehouseId;
        return aName.localeCompare(bName) * factor;
      }
      if (field === 'quantityBase') {
        const aQty = parseFloat(a.quantityBase || '0');
        const bQty = parseFloat(b.quantityBase || '0');
        return (aQty - bQty) * factor;
      }
      if (field === 'classification') {
        const rank: Record<string, number> = {
          expired: 1,
          upcoming: 2,
          normal: 3,
        };
        const aRank = rank[a.classification] ?? 99;
        const bRank = rank[b.classification] ?? 99;
        return (aRank - bRank) * factor;
      }
      return 0;
    });
  });

  // Paginated Items
  readonly totalFiltered = computed(() => this.filteredItems().length);

  readonly paginatedItems = computed(() => {
    const items = this.sortedItems();
    const p = this.page();
    const ps = this.pageSize();
    const start = (p - 1) * ps;
    return items.slice(start, start + ps);
  });

  constructor() {
    this.checkViewport();
    this.loadReferenceData();

    // Debounced search handling
    this.searchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((query) => {
        this.search.set(query.trim());
        this.page.set(1);
      });

    // Primary expiry reload stream (expiry only — reference data loads once above)
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

          return this.inventoryApi.listExpiry().pipe(
            catchError(() => {
              this.loading.set(false);
              this.errorMessage.set('Unable to load expiry inquiry.');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((expiry) => {
        this.rawItems.set(expiry.items);
        this.businessDate.set(expiry.businessDate);
        this.thresholdDays.set(expiry.thresholdDays);
        this.loading.set(false);
      });
  }

  private loadReferenceData(): void {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }

    forkJoin({
      products: this.catalogApi
        .searchProductOptions('', 500)
        .pipe(catchError(() => of([]))),
      warehouses: this.locationsApi
        .listWarehouseOptions()
        .pipe(catchError(() => of([]))),
      batches: this.inventoryApi
        .listBatches({ page: 1, pageSize: 500 })
        .pipe(
          catchError(() =>
            of({
              items: [] as ProductBatchRecord[],
              meta: { page: 1, pageSize: 500, total: 0 },
            }),
          ),
        ),
    })
      .pipe(
        catchError(() => {
          this.errorMessage.set('Unable to load expiry reference data. Please try again.');
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ products, warehouses, batches }) => {
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

        const bMap = new Map<string, ProductBatchRecord>();
        for (const b of batches.items) {
          if (b.id) bMap.set(b.id, b);
        }
        this.batchMap.set(bMap);
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
    } else if (this.selectedItem()) {
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
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
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
  }

  onWarehouseChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.warehouseFilter.set(target.value);
    this.page.set(1);
  }

  onClassificationChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.classificationFilter.set(target.value);
    this.page.set(1);
  }

  clearFilters(): void {
    this.search.set('');
    this.productFilter.set('');
    this.warehouseFilter.set('');
    this.classificationFilter.set('');
    this.page.set(1);
  }

  toggleSort(field: ExpirySortField): void {
    if (this.sortField() === field) {
      this.sortOrder.update((curr) => (curr === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field);
      this.sortOrder.set('asc');
    }
  }

  setViewMode(mode: 'table' | 'cards'): void {
    if (mode === 'cards' && this.isMobile()) return;
    if (mode === 'cards' && !this.allowDesktopCards()) return;
    this.preferredViewMode.set(mode);
  }

  openMobileFilters(): void {
    this.mobileFiltersOpen.set(true);
  }

  closeMobileFilters(): void {
    this.mobileFiltersOpen.set(false);
  }

  openInspector(item: ExpiryInventoryRecord): void {
    this.selectedItem.set(item);
    this.technicalDetailsOpen.set(false);
  }

  closeInspector(): void {
    this.selectedItem.set(null);
  }

  toggleTechnicalDetails(): void {
    this.technicalDetailsOpen.update((open) => !open);
  }

  toggleRowMenu(key: string, event: Event): void {
    event.stopPropagation();
    this.openMenuBatchId.update((current) => (current === key ? null : key));
  }

  closeRowMenu(): void {
    this.openMenuBatchId.set(null);
  }

  // Label & Lookup Helpers
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

  warehouseName(warehouseId: string): string {
    return this.warehouseMap().get(warehouseId)?.name ?? warehouseId;
  }

  warehouseCode(warehouseId: string): string | null {
    const code = this.warehouseMap().get(warehouseId)?.code;
    return code && code.trim() !== '' ? code : null;
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

  getClassificationInfo(classification: string): ExpiryClassificationInfo {
    switch (classification) {
      case 'expired':
        return { label: 'Expired', tone: 'red' };
      case 'upcoming':
        return { label: 'Expiring Soon', tone: 'amber' };
      case 'normal':
      default:
        return { label: 'Normal', tone: 'green' };
    }
  }

  /**
   * Presentation helper for days remaining / overdue relative to business date.
   * Does NOT override authoritative backend classification.
   */
  calculateDaysRemaining(
    expiryDate: string | null | undefined,
    businessDate: string | null | undefined,
  ): { days: number; text: string; isOverdue: boolean; isToday: boolean } | null {
    if (!expiryDate || !businessDate) return null;
    const expParts = expiryDate.trim().split('-');
    const busParts = businessDate.trim().split('-');
    if (expParts.length !== 3 || busParts.length !== 3) return null;

    const expMillis = Date.UTC(
      parseInt(expParts[0]!, 10),
      parseInt(expParts[1]!, 10) - 1,
      parseInt(expParts[2]!, 10),
    );
    const busMillis = Date.UTC(
      parseInt(busParts[0]!, 10),
      parseInt(busParts[1]!, 10) - 1,
      parseInt(busParts[2]!, 10),
    );

    const diffDays = Math.round((expMillis - busMillis) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      return {
        days: diffDays,
        text: `${absDays} ${absDays === 1 ? 'day' : 'days'} overdue`,
        isOverdue: true,
        isToday: false,
      };
    }
    if (diffDays === 0) {
      return {
        days: 0,
        text: 'Expires today',
        isOverdue: false,
        isToday: true,
      };
    }
    return {
      days: diffDays,
      text: `${diffDays} ${diffDays === 1 ? 'day' : 'days'} left`,
      isOverdue: false,
      isToday: false,
    };
  }
}
