import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CatalogApi } from '../../data-access/catalog.api';
import { ProductRecord } from '../../models/catalog.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiLifecycleFilterComponent } from '../../../../shared/ui/ui-lifecycle-filter/ui-lifecycle-filter.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiSearchInputComponent } from '../../../../shared/ui/ui-search-input/ui-search-input.component';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
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
    UiLifecycleFilterComponent,
    UiPaginationComponent,
    UiSearchInputComponent,
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

  readonly items = signal<ProductRecord[]>([]);
  readonly statusFilter = signal<MasterLifecycleFilter>('active');
  readonly visibleItems = this.items;
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly search = signal('');
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('catalog.manage'));
  readonly canManagePricing = computed(() => this.sessionStore.hasPermission('pricing.manage'));
  readonly canView = computed(() => this.sessionStore.hasPermission('catalog.view'));
  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Deactivate');
  private pending:
    | { kind: 'status'; item: ProductRecord; nextStatus: 'active' | 'inactive' }
    | { kind: 'delete'; item: ProductRecord }
    | null = null;

  constructor() {
    this.searchChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((search) => { this.search.set(search.trim()); this.page.set(1); this.reload(); });
    this.reloadRequests.pipe(
      startWith(undefined),
      switchMap(() => {
        if (!this.canView()) {
          this.loading.set(false); this.errorMessage.set('You do not have permission to view products.'); return EMPTY;
        }
        this.loading.set(true); this.errorMessage.set(null);
        return this.api.listProducts({
          page: this.page(), pageSize: this.pageSize(), status: this.statusFilter(), search: this.search(),
        }).pipe(catchError((error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load products.') : 'Unable to load products.');
          return EMPTY;
        }));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ items, meta }) => {
      const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
      if (this.clampAfterLoad && meta.total > 0 && this.page() > totalPages) {
        this.clampAfterLoad = false; this.page.set(totalPages); this.reload(); return;
      }
      this.clampAfterLoad = false; this.items.set(items); this.total.set(meta.total); this.loading.set(false);
    });
  }

  reload(clampAfterLoad = false): void {
    this.clampAfterLoad = clampAfterLoad; this.reloadRequests.next();
  }
  onSearchChange(value: string): void { this.searchChanges.next(value); }
  onStatusChange(value: MasterLifecycleFilter): void { this.statusFilter.set(value); this.page.set(1); this.reload(); }
  onPageChange(page: number): void { this.page.set(page); this.reload(); }
  onPageSizeChange(pageSize: number): void { this.pageSize.set(pageSize); this.page.set(1); this.reload(); }

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
