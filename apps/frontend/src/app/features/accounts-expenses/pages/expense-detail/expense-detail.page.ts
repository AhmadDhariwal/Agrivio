import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ExpensesApi } from '../../data-access/expenses.api';
import { ExpenseRecord } from '../../models/expenses.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-expense-detail-page',
  standalone: true,
  imports: [RouterLink, UiAlertComponent, UiLoadingStateComponent, UiStatusBadgeComponent],
  templateUrl: './expense-detail.page.html',
  styleUrl: './expense-detail.page.scss',
})
export class ExpenseDetailPage {
  private readonly api = inject(ExpensesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly expense = signal<ExpenseRecord | null>(null);

  readonly canView = computed(() => this.sessionStore.hasPermission('expenses.view'));
  readonly canEditDraft = computed(
    () =>
      this.sessionStore.hasPermission('expenses.post') &&
      (this.capabilityService?.canUseModule('expenses') ?? true) &&
      (this.capabilityService?.canPerformAction('expenses.actions.post') ?? true),
  );
  readonly canCorrect = computed(
    () =>
      this.sessionStore.hasPermission('expenses.correct') &&
      (this.capabilityService?.canUseModule('expenses') ?? true) &&
      (this.capabilityService?.canPerformAction('expenses.actions.correct') ?? true),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }
    this.api.getExpense(id).subscribe({
      next: (expense) => {
        this.expense.set(expense);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error));
        this.loading.set(false);
      },
    });
  }

  statusTone(status: string): UiBadgeTone {
    if (status === 'posted') return 'success';
    if (status === 'corrected') return 'warning';
    return 'neutral';
  }

  formatMoney(amount: string | undefined, currency = 'PKR'): string {
    if (!amount) return '—';
    const n = Number(amount);
    return Number.isFinite(n)
      ? `${currency} ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${currency} ${amount}`;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB');
  }

  private mapError(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? (error.error?.error?.message ?? 'Unable to load expense details.')
      : 'Unable to load expense details.';
  }
}
