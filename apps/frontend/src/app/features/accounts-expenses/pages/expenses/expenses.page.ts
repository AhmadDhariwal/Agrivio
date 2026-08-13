import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { ExpensesApi } from '../../data-access/expenses.api';
import { ExpenseCategoryRecord, ExpenseRecord } from '../../models/expenses.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-expenses-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './expenses.page.html',
  styleUrl: './expenses.page.scss',
})
export class ExpensesPage {
  private readonly api = inject(ExpensesApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<ExpenseRecord[]>([]);
  readonly categories = signal<ExpenseCategoryRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canPost = computed(() => this.sessionStore.hasPermission('expenses.post'));
  readonly canView = computed(() => this.sessionStore.hasPermission('expenses.view'));

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view expenses.');
      return;
    }
    this.loading.set(true);
    forkJoin({
      items: this.api.listExpenses(),
      categories: this.api.listCategories(),
    }).subscribe({
      next: ({ items, categories }) => {
        this.items.set(items);
        this.categories.set(categories);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? error.status === 403
              ? (error.error?.error?.message ?? 'You do not have permission to view expenses.')
              : (error.error?.error?.message ?? 'Unable to load expenses.')
            : 'Unable to load expenses.',
        );
      },
    });
  }

  categoryName(categoryId: string): string {
    return this.categories().find((item) => item.id === categoryId)?.name ?? 'Category';
  }
}
