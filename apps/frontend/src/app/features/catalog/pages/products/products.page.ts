import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CatalogApi } from '../../data-access/catalog.api';
import {
  CategoryRecord,
  PackagingUnitRecord,
  ProductPriceRecord,
  ProductRecord,
} from '../../models/catalog.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { applyPaginationMeta } from '../../../../shared/data-access/pagination';
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
import {
  MasterLifecycleFilter,
  deactivateCopy,
  deletePermanentlyCopy,
  reactivateCopy,
  recordInUseMessage,
} from '../../../../shared/lifecycle/master-lifecycle';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

/**
 * ============================================================================
 * AGRIVIO LARGE-DATA RESPONSIVE PATTERN (Reference Implementation: Products)
 * ============================================================================
 *
 * LEVEL 1 — Identity Fields (Flexible / Descriptive)
 *   May compress and truncate with ellipsis and tooltips:
 *   - Product Name (min ~180px, preferred ~280–340px)
 *   - SKU / Code (min ~115px, preferred ~150–180px)
 *   - Category / Classification (min ~120px, preferred ~160–210px)
 *
 * LEVEL 2 — Operational / Data Values (Fixed & Readable)
 *   Must remain stable, readable, and NEVER progressively truncated to force-fit:
 *   - Tracking mode badge (fixed ~125px)
 *   - Base Unit code (fixed ~90px)
 *   - Selling Price (fixed ~130px)
 *   - Available Stock + unit (fixed ~125px)
 *   - Lifecycle Status (fixed ~95px)
 *   - Version / Update date (fixed ~85px)
 *   - Primary row actions (fixed ~85px)
 *
 * LEVEL 3 — Secondary Actions
 *   Collapse into 'More' (⋯) overflow dropdown rather than stealing column width.
 *
 * LEVEL 4 — Responsive Breakpoint Transition
 *   - Large Desktop (>= 1440px): Generous column sizing, no horizontal scroll.
 *   - Normal Desktop (1200px–1439px): Only Level 1 columns shrink/truncate.
 *   - Tablet / Small Desktop (768px–1199px): Level 1 columns reach minimums;
 *     contained horizontal scrolling inside table container (`overflow-x: auto`)
 *     prevents page-level scroll or operational data corruption.
 *   - Phone (< 768px): Desktop table is completely hidden. Products automatically
 *     render purpose-built mobile cards with full-width search, slide-over filter
 *     drawer, compact 2x2 KPIs (~72px), and full-width inspector.
 * ============================================================================
 */

@Component({
  selector: 'agrivio-products-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiConfirmDialogComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './products.page.html',
  styleUrl: './products.page.scss',
})
export class ProductsPage {
  readonly infoTitle = 'About Product Catalog';
  readonly infoDescription =
    'Manage product catalog, pricing, packaging and tracking across the catalog.';
  readonly infoItems = [
    'Configure product identity, SKU codes, and category classification',
    'Manage multi-tier customer pricing and packaging conversion units',
    'Configure inventory tracking behavior (Standard, Batch, Batch + Expiry)',
    'View real-time stock-related availability across workflows',
  ];
  private readonly api = inject(CatalogApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<void>();
  private readonly searchChanges = new Subject<string>();
  private clampAfterLoad = false;

  readonly rawItems = signal<ProductRecord[]>([]);
  readonly categories = signal<CategoryRecord[]>([]);
  readonly statusFilter = signal<MasterLifecycleFilter>('active');
  readonly categoryFilter = signal<string>('');
  readonly trackingFilter = signal<string>('');

  // Responsive View Mode: separate user preferred mode from effective mode on mobile
  readonly preferredViewMode = signal<'table' | 'cards'>('table');
  readonly isMobile = signal<boolean>(false);
  readonly effectiveViewMode = computed<'table' | 'cards'>(() => {
    if (this.isMobile()) {
      return 'cards';
    }
    return this.preferredViewMode() === 'cards' && this.canUseDesktopCards() ? 'cards' : 'table';
  });

  // Mobile Filter Drawer State
  readonly mobileFiltersOpen = signal<boolean>(false);

  readonly openMenuProductId = signal<string | null>(null);

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly search = signal('');
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Inspector Drawer State
  readonly selectedProduct = signal<ProductRecord | null>(null);
  readonly selectedPackagingUnits = signal<PackagingUnitRecord[]>([]);
  readonly selectedPrices = signal<ProductPriceRecord[]>([]);
  readonly inspectorLoading = signal(false);

  readonly canManage = computed(() => this.sessionStore.hasPermission('catalog.manage'));
  readonly canCreate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('inventory.products.actions.create') ?? true),
  );
  readonly canInspect = computed(
    () =>
      this.sessionStore.hasPermission('catalog.view') &&
      (this.capabilityService?.canPerformAction('inventory.products.actions.inspect') ?? true),
  );
  readonly canEdit = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('inventory.products.actions.edit') ?? true),
  );
  readonly canManagePricing = computed(
    () =>
      this.sessionStore.hasPermission('pricing.manage') &&
      (this.capabilityService?.canPerformAction('inventory.products.actions.managePricing') ??
        true) &&
      (this.capabilityService?.canEditField('inventory.products.fields.sellingPrice') ?? true),
  );
  readonly canDeactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('inventory.products.actions.deactivate') ?? true),
  );
  readonly canReactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('inventory.products.actions.reactivate') ?? true),
  );
  readonly canDelete = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('inventory.products.actions.delete') ?? true),
  );
  readonly canView = computed(() => this.sessionStore.hasPermission('catalog.view'));
  readonly canUseDesktopCards = computed(
    () => this.capabilityService?.canUseView('inventory.products.views.desktopCards') ?? true,
  );
  readonly showSku = computed(
    () => this.capabilityService?.canViewField('inventory.products.fields.sku') ?? true,
  );
  readonly showSellingPrice = computed(
    () => this.capabilityService?.canViewField('inventory.products.fields.sellingPrice') ?? true,
  );
  readonly showTotalProducts = computed(
    () => this.capabilityService?.canShowWidget('inventory.products.widgets.totalProducts') ?? true,
  );
  readonly showActiveProducts = computed(
    () =>
      this.capabilityService?.canShowWidget('inventory.products.widgets.activeProducts') ?? true,
  );
  readonly showLowStock = computed(
    () => this.capabilityService?.canShowWidget('inventory.products.widgets.lowStock') ?? true,
  );
  readonly showTrackedItems = computed(
    () => this.capabilityService?.canShowWidget('inventory.products.widgets.trackedItems') ?? true,
  );
  readonly hasWidgets = computed(
    () =>
      this.showTotalProducts() ||
      this.showActiveProducts() ||
      this.showLowStock() ||
      this.showTrackedItems(),
  );

  // Category Map for fast lookup
  readonly categoriesMap = computed(() => {
    const map = new Map<string, CategoryRecord>();
    for (const cat of this.categories()) {
      map.set(cat.id, cat);
    }
    return map;
  });

  // Client-filtered items based on category and tracking filters
  readonly visibleItems = computed(() => {
    let list = this.rawItems();
    const catId = this.categoryFilter();
    const trackMode = this.trackingFilter();

    if (catId) {
      list = list.filter((p) => p.categoryId === catId);
    }
    if (trackMode) {
      list = list.filter((p) => p.trackingMode === trackMode);
    }
    return list;
  });

  // KPI Metrics computed from current dataset & pagination stats
  readonly kpis = computed(() => {
    const items = this.rawItems();
    const active = items.filter((p) => p.status === 'active').length;
    const inactive = items.filter((p) => p.status === 'inactive').length;
    const tracked = items.filter((p) => p.trackingMode !== 'none').length;
    const lowStock = items.filter((p) => {
      const stock = this.stockQuantity(p);
      return stock > 0 && stock <= 20;
    }).length;

    return {
      total: this.total(),
      active:
        this.statusFilter() === 'inactive'
          ? active
          : this.statusFilter() === 'all'
            ? active
            : this.total(),
      tracked: tracked,
      lowStock: lowStock,
      inactive: this.statusFilter() === 'inactive' ? this.total() : inactive,
    };
  });

  readonly hasActiveFilters = computed(() => {
    return Boolean(
      this.search() ||
      this.categoryFilter() ||
      this.trackingFilter() ||
      this.statusFilter() !== 'active',
    );
  });

  readonly activeFiltersCount = computed(() => {
    let count = 0;
    if (this.categoryFilter()) count++;
    if (this.trackingFilter()) count++;
    if (this.statusFilter() !== 'active') count++;
    return count;
  });

  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Deactivate');
  private pending:
    | { kind: 'status'; item: ProductRecord; nextStatus: 'active' | 'inactive' }
    | { kind: 'delete'; item: ProductRecord }
    | null = null;

  constructor() {
    this.updateMobileState();

    // Load categories for filter dropdown & table categorization
    this.api
      .searchCategoryOptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cats) => this.categories.set(cats),
        error: () => this.categories.set([]),
      });

    this.searchChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((search) => {
        this.search.set(search.trim());
        this.page.set(1);
        this.reload();
      });

    this.reloadRequests
      .pipe(
        startWith(undefined),
        switchMap(() => {
          if (!this.canView()) {
            this.loading.set(false);
            this.errorMessage.set('You do not have permission to view products.');
            return EMPTY;
          }
          this.loading.set(true);
          this.errorMessage.set(null);
          return this.api
            .listProducts({
              page: this.page(),
              pageSize: this.pageSize(),
              status: this.statusFilter(),
              search: this.search(),
              includeListSummary: true,
            })
            .pipe(
              catchError((error: unknown) => {
                this.loading.set(false);
                this.errorMessage.set(
                  error instanceof HttpErrorResponse
                    ? (error.error?.error?.message ?? 'Unable to load products.')
                    : 'Unable to load products.',
                );
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ items, meta }) => {
        const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
        if (this.clampAfterLoad && meta.total > 0 && this.page() > totalPages) {
          this.clampAfterLoad = false;
          this.page.set(totalPages);
          this.reload();
          return;
        }
        this.clampAfterLoad = false;
        this.rawItems.set(items);
        applyPaginationMeta(meta, { total: this.total, pageSize: this.pageSize });
        this.loading.set(false);
      });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateMobileState();
  }

  private updateMobileState(): void {
    if (typeof window !== 'undefined') {
      this.isMobile.set(window.innerWidth < 768);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.openMenuProductId()) {
      this.closeRowMenu();
    } else if (this.mobileFiltersOpen()) {
      this.closeMobileFilters();
    } else if (this.selectedProduct()) {
      this.closeInspector();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.openMenuProductId()) {
      this.closeRowMenu();
    }
  }

  getSellingPrice(product: ProductRecord): string {
    const amount = product.listSummary?.sellingPrice?.amount;
    if (!amount) return '—';
    const num = Number(amount);
    if (isNaN(num)) return `PKR ${amount}`;
    return `PKR ${num.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  getStockData(product: ProductRecord): { amount: string; tone: 'normal' | 'low' | 'out' } {
    const stock = this.stockQuantity(product);
    if (stock === 0) {
      return { amount: '0', tone: 'out' };
    }
    if (stock <= 20) {
      return { amount: stock.toLocaleString(), tone: 'low' };
    }
    return { amount: stock.toLocaleString(), tone: 'normal' };
  }

  private stockQuantity(product: ProductRecord): number {
    const raw = product.listSummary?.availableQuantityBase ?? '0';
    const parsed = parseFloat(raw);
    return isNaN(parsed) ? 0 : parsed;
  }

  toggleRowMenu(productId: string, event: Event): void {
    event.stopPropagation();
    this.openMenuProductId.update((current) => (current === productId ? null : productId));
  }

  closeRowMenu(): void {
    this.openMenuProductId.set(null);
  }

  reload(clampAfterLoad = false): void {
    this.clampAfterLoad = clampAfterLoad;
    this.reloadRequests.next();
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target) {
      this.searchChanges.next(target.value);
    }
  }

  onSearchClear(): void {
    this.search.set('');
    this.page.set(1);
    this.reload();
  }

  onStatusChange(value: MasterLifecycleFilter): void {
    this.statusFilter.set(value);
    this.page.set(1);
    this.reload();
  }

  onCategoryChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.categoryFilter.set(target.value);
  }

  onTrackingChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.trackingFilter.set(target.value);
  }

  clearFilters(): void {
    this.search.set('');
    this.categoryFilter.set('');
    this.trackingFilter.set('');
    this.statusFilter.set('active');
    this.page.set(1);
    this.reload();
  }

  setViewMode(mode: 'table' | 'cards'): void {
    if (mode === 'cards' && !this.canUseDesktopCards()) {
      return;
    }
    this.preferredViewMode.set(mode);
  }

  openMobileFilters(): void {
    this.mobileFiltersOpen.set(true);
  }

  closeMobileFilters(): void {
    this.mobileFiltersOpen.set(false);
  }

  toggleMobileFilters(): void {
    this.mobileFiltersOpen.update((open) => !open);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.reload();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.reload();
  }

  // Inspector Drawer Actions
  openInspector(item: ProductRecord): void {
    if (!this.canInspect()) {
      return;
    }
    this.selectedProduct.set(item);
    this.selectedPackagingUnits.set([]);
    this.selectedPrices.set([]);
    this.inspectorLoading.set(true);

    forkJoin({
      packagingUnits: this.api.listPackagingUnits(item.id).pipe(catchError(() => of([]))),
      prices: this.api.listPrices(item.id).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ packagingUnits, prices }) => {
        if (packagingUnits) this.selectedPackagingUnits.set(packagingUnits);
        if (prices) this.selectedPrices.set(prices);
        this.inspectorLoading.set(false);
      },
      error: () => {
        this.inspectorLoading.set(false);
      },
    });
  }

  closeInspector(): void {
    this.selectedProduct.set(null);
  }

  getCategoryName(categoryId: string): string {
    const cat = this.categoriesMap().get(categoryId);
    return cat ? cat.name : 'General';
  }

  getCategoryClass(categoryId: string): string {
    const cat = this.categoriesMap().get(categoryId);
    return cat?.productClass ? String(cat.productClass) : 'general';
  }

  formatTrackingLabel(trackingMode: string): string {
    if (trackingMode === 'batch_expiry') return 'Batch + Expiry';
    if (trackingMode === 'batch') return 'Batch';
    return 'None';
  }

  askDeactivate(item: ProductRecord): void {
    this.closeRowMenu();
    const copy = deactivateCopy(
      'product',
      'Existing invoices, purchases and stock history will remain unchanged.',
    );
    this.pending = { kind: 'status', item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmOpen.set(true);
  }

  askReactivate(item: ProductRecord): void {
    this.closeRowMenu();
    const copy = reactivateCopy('product');
    this.pending = { kind: 'status', item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmOpen.set(true);
  }

  askDelete(item: ProductRecord): void {
    this.closeRowMenu();
    const copy = deletePermanentlyCopy('product');
    this.pending = { kind: 'delete', item };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Delete permanently');
    this.confirmOpen.set(true);
  }

  confirmLifecycle(): void {
    const pending = this.pending;
    this.confirmOpen.set(false);
    this.pending = null;
    if (
      !pending ||
      (pending.kind === 'delete' && !this.canDelete()) ||
      (pending.kind === 'status' &&
        ((pending.nextStatus === 'active' && !this.canReactivate()) ||
          (pending.nextStatus === 'inactive' && !this.canDeactivate())))
    ) {
      return;
    }
    if (pending.kind === 'delete') {
      this.api.deleteProduct(pending.item.id).subscribe({
        next: () => {
          this.successMessage.set('Product deleted.');
          if (this.selectedProduct()?.id === pending.item.id) {
            this.closeInspector();
          }
          this.reload(true);
        },
        error: (error: unknown) => {
          this.errorMessage.set(recordInUseMessage(error, 'Unable to delete product.'));
        },
      });
      return;
    }
    this.api
      .updateProduct(pending.item.id, {
        expectedVersion: pending.item.version,
        status: pending.nextStatus,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(
            pending.nextStatus === 'inactive' ? 'Product deactivated.' : 'Product reactivated.',
          );
          if (this.selectedProduct()?.id === pending.item.id) {
            this.closeInspector();
          }
          this.reload();
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            error instanceof HttpErrorResponse
              ? (error.error?.error?.message ?? 'Unable to update product status.')
              : 'Unable to update product status.',
          );
        },
      });
  }
}
