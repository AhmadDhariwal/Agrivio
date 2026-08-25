import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AccountsApi } from '../../data-access/accounts.api';
import { AccountRecord } from '../../models/accounts.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
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
  selector: 'agrivio-accounts-page',
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
  templateUrl: './accounts.page.html',
  styleUrl: './accounts.page.scss',
})
export class AccountsPage {
  private readonly api = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<AccountRecord[]>([]);
  readonly statusFilter = signal<MasterLifecycleFilter>('active');
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('accounts.manage'));
  readonly canView = computed(() => this.sessionStore.hasPermission('accounts.view'));

  readonly activeCount = computed(
    () => this.items().filter((i) => i.status === 'active').length,
  );
  readonly inactiveCount = computed(
    () => this.items().filter((i) => i.status === 'inactive').length,
  );
  readonly totalBalanceFormatted = computed(() => {
    const total = this.items().reduce((acc, item) => {
      const num = Number(item.derivedBalances?.balance?.amount ?? 0);
      return acc + (isNaN(num) ? 0 : num);
    }, 0);
    return `PKR ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  });

  readonly hasActiveFilters = computed(
    () => this.statusFilter() !== 'active' || !!this.search(),
  );

  readonly openMenuAccountId = signal<string | null>(null);
  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Deactivate');
  private pending:
    | { kind: 'status'; item: AccountRecord; nextStatus: 'active' | 'inactive' }
    | { kind: 'delete'; item: AccountRecord }
    | null = null;

  readonly infoTitle = 'About Accounts';
  readonly infoDescription =
    'Track and manage all cash, bank, and wallet accounts used for money movements, receipts, and payments.';
  readonly infoItems = [
    'Account balances are derived from signed movements and cannot be directly edited.',
    'Posted movements are never overwritten — corrections create offsetting entries.',
    'Deactivating an account prevents new transactions without affecting historical records.',
  ];

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view accounts.');
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

    this.api.listAccounts(params).subscribe({
      next: ({ items, meta }) => {
        this.items.set(items);
        this.total.set(meta.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load accounts.')
            : 'Unable to load accounts.',
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

  formatBalance(item: AccountRecord): string {
    const balance = item.derivedBalances?.balance;
    if (!balance) return '—';
    const value = Number(balance.amount);
    if (isNaN(value)) return `${balance.currency} ${balance.amount}`;
    return `${balance.currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  accountTypeLabel(type: string): string {
    switch (type) {
      case 'cash': return 'Cash';
      case 'bank': return 'Bank';
      case 'jazzcash': return 'JazzCash';
      case 'easypaisa': return 'Easypaisa';
      default: return type;
    }
  }

  toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenuAccountId.update((curr) => (curr === id ? null : id));
  }

  closeMenu(): void {
    this.openMenuAccountId.set(null);
  }

  askDeactivate(item: AccountRecord): void {
    this.closeMenu();
    const copy = deactivateCopy('account', 'Existing payments and account movements will remain unchanged.');
    this.pending = { kind: 'status', item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmOpen.set(true);
  }

  askReactivate(item: AccountRecord): void {
    this.closeMenu();
    const copy = reactivateCopy('account');
    this.pending = { kind: 'status', item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmOpen.set(true);
  }

  askDelete(item: AccountRecord): void {
    this.closeMenu();
    const copy = deletePermanentlyCopy('account');
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
      this.api.deleteAccount(pending.item.id).subscribe({
        next: () => { this.successMessage.set('Account deleted.'); this.reload(); },
        error: (error: unknown) => { this.errorMessage.set(recordInUseMessage(error, 'Unable to delete account.')); },
      });
      return;
    }
    this.api.updateAccount(pending.item.id, { expectedVersion: pending.item.version, status: pending.nextStatus }).subscribe({
      next: () => {
        this.successMessage.set(pending.nextStatus === 'inactive' ? 'Account deactivated.' : 'Account reactivated.');
        this.reload();
      },
      error: (error: unknown) => {
        this.errorMessage.set(error instanceof HttpErrorResponse ? (error.error?.error?.message ?? 'Unable to update account status.') : 'Unable to update account status.');
      },
    });
  }
}
