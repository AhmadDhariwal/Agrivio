import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ExpensesApi } from '../../data-access/expenses.api';
import { ExpenseCategoryRecord } from '../../models/expenses.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiLifecycleFilterComponent } from '../../../../shared/ui/ui-lifecycle-filter/ui-lifecycle-filter.component';
import {
  MasterLifecycleFilter,
  deactivateCopy,
  filterMasterLifecycle,
  reactivateCopy,
} from '../../../../shared/lifecycle/master-lifecycle';

@Component({
  selector: 'agrivio-expense-categories-page',
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
  ],
  templateUrl: './expense-categories.page.html',
  styleUrl: './expense-categories.page.scss',
})
export class ExpenseCategoriesPage {
  private readonly api = inject(ExpensesApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<ExpenseCategoryRecord[]>([]);
  readonly statusFilter = signal<MasterLifecycleFilter>('all');
  readonly visibleItems = computed(() => filterMasterLifecycle(this.items(), this.statusFilter()));
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly canPost = computed(() => this.sessionStore.hasPermission('expenses.post'));
  readonly canView = computed(() => this.sessionStore.hasPermission('expenses.view'));
  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Deactivate');
  private pending: { item: ExpenseCategoryRecord; nextStatus: 'active' | 'inactive' } | null = null;

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
    this.api.listCategories().subscribe({
      next: (items) => {
        this.items.set(items);
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

  askDeactivate(item: ExpenseCategoryRecord): void {
    const copy = deactivateCopy('expense category', 'Existing posted expenses will remain unchanged.');
    this.pending = { item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmOpen.set(true);
  }

  askReactivate(item: ExpenseCategoryRecord): void {
    const copy = reactivateCopy('expense category');
    this.pending = { item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmOpen.set(true);
  }

  confirmLifecycle(): void {
    const pending = this.pending;
    this.confirmOpen.set(false);
    this.pending = null;
    if (!pending || !this.canPost()) {
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
