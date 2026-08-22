import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CatalogApi } from '../../data-access/catalog.api';
import { CategoryRecord } from '../../models/catalog.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
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

@Component({
  selector: 'agrivio-categories-page',
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
  templateUrl: './categories.page.html',
  styleUrl: './categories.page.scss',
})
export class CategoriesPage {
  readonly infoTitle = 'About Product Categories';
  readonly infoDescription =
    'Organize product classification and enforce regulatory tracking and lifecycle consistency.';
  readonly infoItems = [
    'Classify products into agricultural categories and taxonomies',
    'Enforce derived regulatory tracking rules (Pesticides, Fertilizers, Seeds)',
    'Manage catalog-wide lifecycle status and active availability',
    'Ensure consistent unit dimensions across related product lines',
  ];
  private readonly api = inject(CatalogApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<void>();
  private readonly searchChanges = new Subject<string>();
  private clampAfterLoad = false;

  readonly rawItems = signal<CategoryRecord[]>([]);
  readonly visibleItems = this.rawItems;
  readonly statusFilter = signal<MasterLifecycleFilter>('active');

  // Responsive View Mode: table is default; phone (<768px) automatically renders cards
  readonly preferredViewMode = signal<'table' | 'cards'>('table');
  readonly isMobile = signal<boolean>(false);
  readonly effectiveViewMode = computed<'table' | 'cards'>(() => {
    if (this.isMobile()) {
      return 'cards';
    }
    return this.preferredViewMode() === 'cards' && !this.canUseDesktopCards()
      ? 'table'
      : this.preferredViewMode();
  });

  // Mobile Filter Drawer State
  readonly mobileFiltersOpen = signal<boolean>(false);

  // Row Action Menu State
  readonly openMenuCategoryId = signal<string | null>(null);

  // Inspector Drawer State
  readonly selectedCategory = signal<CategoryRecord | null>(null);

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly search = signal('');
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly canManage = computed(() => this.sessionStore.hasPermission('catalog.manage'));
  readonly canView = computed(() => this.sessionStore.hasPermission('catalog.view'));
  readonly canCreate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('inventory.categories.actions.create') ?? true),
  );
  readonly canInspect = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('inventory.categories.actions.inspect') ?? true),
  );
  readonly canEdit = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('inventory.categories.actions.edit') ?? true),
  );
  readonly canDeactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('inventory.categories.actions.deactivate') ?? true),
  );
  readonly canReactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('inventory.categories.actions.reactivate') ?? true),
  );
  readonly canDelete = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('inventory.categories.actions.delete') ?? true),
  );
  readonly canUseDesktopCards = computed(
    () => this.capabilityService?.canUseView('inventory.categories.views.desktopCards') ?? true,
  );
  readonly showTotalCategories = computed(
    () =>
      this.capabilityService?.canShowWidget('inventory.categories.widgets.totalCategories') ?? true,
  );
  readonly showName = computed(
    () => this.capabilityService?.canViewField('inventory.categories.fields.name') ?? true,
  );
  readonly showProductClass = computed(
    () => this.capabilityService?.canViewField('inventory.categories.fields.productClass') ?? true,
  );
  readonly showStatus = computed(
    () => this.capabilityService?.canViewField('inventory.categories.fields.status') ?? true,
  );
  readonly showTrackingRequirement = computed(
    () =>
      this.capabilityService?.canUseView(
        'inventory.categories.features.trackingRequirementDisplay',
      ) ?? true,
  );

  readonly hasActiveFilters = computed(() => {
    return Boolean(this.search() || this.statusFilter() !== 'active');
  });

  readonly activeFiltersCount = computed(() => {
    return this.statusFilter() !== 'active' ? 1 : 0;
  });

  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Deactivate');
  private pending:
    | { kind: 'status'; item: CategoryRecord; nextStatus: 'active' | 'inactive' }
    | { kind: 'delete'; item: CategoryRecord }
    | null = null;

  constructor() {
    this.updateMobileState();

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
            this.errorMessage.set('You do not have permission to view categories.');
            return EMPTY;
          }
          this.loading.set(true);
          this.errorMessage.set(null);
          return this.api
            .listCategories({
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
                    ? (error.error?.error?.message ?? 'Unable to load categories.')
                    : 'Unable to load categories.',
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
    if (this.openMenuCategoryId()) {
      this.closeRowMenu();
    } else if (this.mobileFiltersOpen()) {
      this.closeMobileFilters();
    } else if (this.selectedCategory()) {
      this.closeInspector();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.openMenuCategoryId()) {
      this.closeRowMenu();
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

  clearFilters(): void {
    this.search.set('');
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

  toggleRowMenu(categoryId: string, event: Event): void {
    event.stopPropagation();
    this.openMenuCategoryId.update((current) => (current === categoryId ? null : categoryId));
  }

  closeRowMenu(): void {
    this.openMenuCategoryId.set(null);
  }

  openInspector(item: CategoryRecord): void {
    if (!this.canInspect()) {
      return;
    }
    this.selectedCategory.set(item);
  }

  closeInspector(): void {
    this.selectedCategory.set(null);
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

  // Derived Business Rules for Product Classes & Tracking Requirements
  isBatchRequired(productClass: string): boolean {
    const cls = productClass?.toLowerCase();
    return cls === 'fertilizer' || cls === 'seed' || cls === 'pesticide' || cls === 'chemical';
  }

  getTrackingRequirement(productClass: string): string {
    return this.isBatchRequired(productClass) ? 'Batch required' : 'Standard';
  }

  getProductClassLabel(productClass: string): string {
    if (!productClass) return 'General';
    const map: Record<string, string> = {
      general: 'General',
      fertilizer: 'Fertilizer',
      seed: 'Seed',
      pesticide: 'Pesticide',
      chemical: 'Chemical',
    };
    return map[productClass.toLowerCase()] || productClass;
  }

  // Lifecycle Actions
  askDeactivate(item: CategoryRecord): void {
    this.closeRowMenu();
    const copy = deactivateCopy(
      'category',
      'Existing products and posted history will remain unchanged.',
    );
    this.pending = { kind: 'status', item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmOpen.set(true);
  }

  askReactivate(item: CategoryRecord): void {
    this.closeRowMenu();
    const copy = reactivateCopy('category');
    this.pending = { kind: 'status', item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmOpen.set(true);
  }

  askDelete(item: CategoryRecord): void {
    this.closeRowMenu();
    const copy = deletePermanentlyCopy('category');
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
    if (!pending) {
      return;
    }
    if (pending.kind === 'delete') {
      if (!this.canDelete()) return;
      this.api.deleteCategory(pending.item.id).subscribe({
        next: () => {
          this.successMessage.set('Category deleted.');
          if (this.selectedCategory()?.id === pending.item.id) {
            this.closeInspector();
          }
          this.reload(true);
        },
        error: (error: unknown) => {
          this.errorMessage.set(recordInUseMessage(error, 'Unable to delete category.'));
        },
      });
      return;
    }
    if (
      (pending.nextStatus === 'inactive' && !this.canDeactivate()) ||
      (pending.nextStatus === 'active' && !this.canReactivate())
    ) {
      return;
    }
    this.api
      .updateCategory(pending.item.id, {
        expectedVersion: pending.item.version,
        status: pending.nextStatus,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(
            pending.nextStatus === 'inactive' ? 'Category deactivated.' : 'Category reactivated.',
          );
          if (this.selectedCategory()?.id === pending.item.id) {
            this.closeInspector();
          }
          this.reload();
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            error instanceof HttpErrorResponse
              ? (error.error?.error?.message ?? 'Unable to update category status.')
              : 'Unable to update category status.',
          );
        },
      });
  }
}
