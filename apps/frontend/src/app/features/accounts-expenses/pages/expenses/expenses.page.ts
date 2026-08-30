import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ExpensesApi } from '../../data-access/expenses.api';
import { ExpenseRecord } from '../../models/expenses.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiStatusBadgeComponent,
  UiBadgeTone,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';

@Component({
  selector: 'agrivio-expenses-page',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './expenses.page.html',
  styleUrl: './expenses.page.scss',
})
export class ExpensesPage {
  private readonly api = inject(ExpensesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly items = signal<ExpenseRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);

  readonly statusFilter = signal<string>('');
  readonly search = signal<string>('');

  readonly canUseExpenses = computed(
    () => this.capabilityService?.canUseModule('expenses') ?? true,
  );
  readonly canPost = computed(
    () =>
      this.sessionStore.hasPermission('expenses.post') &&
      (this.capabilityService?.canPerformAction('expenses.actions.post') ?? true),
  );
  readonly canView = computed(
    () => this.sessionStore.hasPermission('expenses.view') && this.canUseExpenses(),
  );

  // Feature visibility
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseView('expenses.features.moduleInfo') ?? true,
  );
  readonly showStatusFilter = computed(
    () => this.capabilityService?.canUseView('expenses.features.statusFilter') ?? true,
  );
  readonly showDateSearch = computed(
    () => this.capabilityService?.canUseView('expenses.features.dateSearch') ?? true,
  );

  // Action computeds (RBAC ∩ Capability)
  readonly canInspect = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('expenses.actions.inspect') ?? true),
  );
  readonly canManageCategories = computed(
    () =>
      this.sessionStore.hasPermission('expenses.post') &&
      (this.capabilityService?.canPerformAction('expenses.actions.manageCategories') ?? true),
  );

  readonly hasActiveFilters = computed(
    () => !!this.statusFilter() || !!this.search(),
  );

  readonly postedCount = computed(
    () => this.items().filter((i) => i.status === 'posted').length,
  );
  readonly correctedCount = computed(
    () => this.items().filter((i) => i.status === 'corrected').length,
  );
  readonly categoriesCount = computed(
    () => new Set(this.items().map((i) => i.categoryId).filter(Boolean)).size,
  );

  readonly infoTitle = 'About Expenses';
  readonly infoDescription =
    'Expenses are recorded against accounts and categories. Once posted, entries are locked for edits to maintain data integrity.';
  readonly infoItems = [
    'Record operating expenses against a selected account and category.',
    'Posted expenses cannot be edited or deleted — use the correction workflow instead.',
    'Corrections reference the original posted expense and create a separate auditable record.',
    'Expense categories help organize and report operational spending.',
  ];

  constructor() {
    this.reload();
  }

  reload(forceRefresh = false): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view expenses.');
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);

    const params: { page: number; pageSize: number; status?: string; search?: string; forceRefresh?: boolean } = {
      page: this.page(),
      pageSize: this.pageSize(),
      forceRefresh,
    };
    if (this.statusFilter()) params.status = this.statusFilter();
    if (this.search()) params.search = this.search();

    this.api.listExpenses(params).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.total.set(result.meta.total);
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

  onPageChange(page: number): void {
    this.page.set(page);
    this.reload();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.reload();
  }

  onStatusChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.statusFilter.set(target.value);
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
    this.statusFilter.set('');
    this.search.set('');
    this.page.set(1);
    this.reload();
  }

  categoryName(item: ExpenseRecord): string {
    return item.categoryName ?? '—';
  }

  accountName(item: ExpenseRecord): string {
    return item.accountName ?? '—';
  }

  formatAmount(amount: { amount: string; currency: string }): string {
    const value = Number(amount.amount);
    if (isNaN(value)) return `${amount.currency} ${amount.amount}`;
    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${amount.currency} ${formatted}`;
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  statusTone(status: string): UiBadgeTone {
    switch (status) {
      case 'posted':
        return 'success';
      case 'corrected':
        return 'warning';
      case 'draft':
        return 'neutral';
      default:
        return 'neutral';
    }
  }
}
