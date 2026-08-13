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
  ],
  templateUrl: './expense-categories.page.html',
  styleUrl: './expense-categories.page.scss',
})
export class ExpenseCategoriesPage {
  private readonly api = inject(ExpensesApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<ExpenseCategoryRecord[]>([]);
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
}
