import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ExpensesApi } from '../../data-access/expenses.api';
import { ExpenseCategoryRecord } from '../../models/expenses.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiStatusBadgeComponent,
  UiBadgeTone,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import {
  MasterLifecycleFilter,
  deactivateCopy,
  deletePermanentlyCopy,
  reactivateCopy,
  recordInUseMessage,
} from '../../../../shared/lifecycle/master-lifecycle';

@Component({
  selector: 'agrivio-expense-categories-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiConfirmDialogComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './expense-categories.page.html',
  styleUrl: './expense-categories.page.scss',
})
export class ExpenseCategoriesPage {
  private readonly api = inject(ExpensesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly items = signal<ExpenseCategoryRecord[]>([]);
  readonly statusFilter = signal<MasterLifecycleFilter>('active');
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly canManage = computed(
    () =>
      this.sessionStore.hasPermission('expenses.post') &&
      (this.capabilityService?.canPerformAction('expenses.actions.manageCategories') ?? true),
  );
  readonly canView = computed(() => this.sessionStore.hasPermission('expenses.view'));

  readonly hasActiveFilters = computed(
    () => this.statusFilter() !== 'active' || !!this.search(),
  );

  readonly openMenuCategoryId = signal<string | null>(null);

  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Deactivate');
  private pending:
    | { kind: 'status'; item: ExpenseCategoryRecord; nextStatus: 'active' | 'inactive' }
    | { kind: 'delete'; item: ExpenseCategoryRecord }
    | null = null;

  readonly infoTitle = 'About expense categories';
  readonly infoDescription =
    'Expense categories help you classify and organize operating expenses for accurate tracking, reporting, and analysis.';
  readonly infoItems = [
    'Each expense must be recorded against an active category.',
    'Deactivating a category prevents new usage without affecting historical records.',
    'Categories with posted expenses cannot be permanently deleted.',
  ];

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view expense categories.');
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.closeMenu();

    const params: { page: number; pageSize: number; status?: string; search?: string } = {
      page: this.page(),
      pageSize: this.pageSize(),
    };
    if (this.statusFilter() !== 'active') params.status = this.statusFilter();
    else params.status = 'active';
    if (this.search()) params.search = this.search();

    this.api.listCategories(params).subscribe({
      next: ({ items, meta }) => {
        this.items.set(items);
        this.total.set(meta.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load expense categories.')
            : 'Unable to load expense categories.',
        );
      },
    });
  }

  onStatusChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.statusFilter.set(target.value as MasterLifecycleFilter);
    this.page.set(1);
    this.reload();
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.search.set(target.value.trim());
    this.page.set(1);
    this.reload();
  }

  clearFilters(): void {
    this.statusFilter.set('active');
    this.search.set('');
    this.page.set(1);
    this.reload();
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

  statusTone(status: string): UiBadgeTone {
    return status === 'active' ? 'success' : 'neutral';
  }

  toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenuCategoryId.update((curr) => (curr === id ? null : id));
  }

  closeMenu(): void {
    this.openMenuCategoryId.set(null);
  }

  askDeactivate(item: ExpenseCategoryRecord): void {
    this.closeMenu();
    const copy = deactivateCopy('expense category', 'Existing posted expenses will remain unchanged.');
    this.pending = { kind: 'status', item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmOpen.set(true);
  }

  askReactivate(item: ExpenseCategoryRecord): void {
    this.closeMenu();
    const copy = reactivateCopy('expense category');
    this.pending = { kind: 'status', item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmOpen.set(true);
  }

  askDelete(item: ExpenseCategoryRecord): void {
    this.closeMenu();
    const copy = deletePermanentlyCopy('expense category');
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
    if (!pending || !this.canManage()) return;
    if (pending.kind === 'delete') {
      this.api.deleteCategory(pending.item.id).subscribe({
        next: () => {
          this.successMessage.set('Expense category deleted.');
          this.reload();
        },
        error: (error: unknown) => {
          this.errorMessage.set(recordInUseMessage(error, 'Unable to delete expense category.'));
        },
      });
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
            pending.nextStatus === 'inactive'
              ? 'Expense category deactivated.'
              : 'Expense category reactivated.',
          );
          this.reload();
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            error instanceof HttpErrorResponse
              ? (error.error?.error?.message ?? 'Unable to update expense category status.')
              : 'Unable to update expense category status.',
          );
        },
      });
  }
}
