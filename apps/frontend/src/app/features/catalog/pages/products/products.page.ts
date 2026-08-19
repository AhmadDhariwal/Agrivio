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
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { applyPaginationMeta } from '../../../../shared/data-access/pagination';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, forkJoin, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MasterLifecycleFilter,
  deactivateCopy,
  deletePermanentlyCopy,
  reactivateCopy,
  recordInUseMessage,
} from '../../../../shared/lifecycle/master-lifecycle';

@Component({
  selector: 'agrivio-products-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiConfirmDialogComponent,
    UiPaginationComponent,
  ],
  templateUrl: './products.page.html',
  styleUrl: './products.page.scss',
})
export class ProductsPage {
  private readonly api = inject(CatalogApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<void>();
  private readonly searchChanges = new Subject<string>();
  private clampAfterLoad = false;

  readonly rawItems = signal<ProductRecord[]>([]);
  readonly categories = signal<CategoryRecord[]>([]);
  readonly statusFilter = signal<MasterLifecycleFilter>('active');
  readonly categoryFilter = signal<string>('');
  readonly trackingFilter = signal<string>('');
  readonly viewMode = signal<'table' | 'cards'>('table');

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
  readonly canManagePricing = computed(() => this.sessionStore.hasPermission('pricing.manage'));
  readonly canView = computed(() => this.sessionStore.hasPermission('catalog.view'));

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
    return {
      total: this.total(),
      active: this.statusFilter() === 'inactive' ? active : (this.statusFilter() === 'all' ? active : this.total()),
      tracked: tracked,
      inactive: this.statusFilter() === 'inactive' ? this.total() : inactive,
    };
  });

  readonly hasActiveFilters = computed(() => {
    return Boolean(this.search() || this.categoryFilter() || this.trackingFilter() || this.statusFilter() !== 'active');
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selectedProduct()) {
      this.closeInspector();
    }
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
    this.viewMode.set(mode);
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
    this.selectedProduct.set(item);
    this.selectedPackagingUnits.set([]);
    this.selectedPrices.set([]);
    this.inspectorLoading.set(true);

    forkJoin({
      packagingUnits: this.api.listPackagingUnits(item.id).pipe(catchError(() => EMPTY)),
      prices: this.api.listPrices(item.id).pipe(catchError(() => EMPTY)),
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
    const copy = reactivateCopy('product');
    this.pending = { kind: 'status', item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmOpen.set(true);
  }

  askDelete(item: ProductRecord): void {
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
    if (!pending || !this.canManage()) {
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

