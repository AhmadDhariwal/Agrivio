import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AccountsApi } from '../../data-access/accounts.api';
import { AccountRecord, AccountsSummary } from '../../models/accounts.models';
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
import { TransferMoneyDialogComponent } from '../../components/transfer-money-dialog/transfer-money-dialog.component';
import { AddMoneyDialogComponent } from '../../components/add-money-dialog/add-money-dialog.component';
import { WithdrawMoneyDialogComponent } from '../../components/withdraw-money-dialog/withdraw-money-dialog.component';
import { AdjustBalanceDialogComponent } from '../../components/adjust-balance-dialog/adjust-balance-dialog.component';
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
    TransferMoneyDialogComponent,
    AddMoneyDialogComponent,
    WithdrawMoneyDialogComponent,
    AdjustBalanceDialogComponent,
  ],
  templateUrl: './accounts.page.html',
  styleUrl: './accounts.page.scss',
})
export class AccountsPage {
  private readonly api = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly items = signal<AccountRecord[]>([]);
  readonly summary = signal<AccountsSummary | null>(null);
  readonly statusFilter = signal<MasterLifecycleFilter>('active');
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Dialog states
  readonly transferDialogOpen = signal(false);
  readonly addMoneyDialogOpen = signal(false);
  readonly withdrawMoneyDialogOpen = signal(false);
  readonly adjustBalanceDialogOpen = signal(false);
  readonly actionAccountId = signal<string | undefined>(undefined);

  readonly canUseAccounts = computed(
    () => this.capabilityService?.canUseModule('accounts') ?? true,
  );
  readonly canManage = computed(
    () => this.sessionStore.hasPermission('accounts.manage') && this.canUseAccounts(),
  );
  readonly canView = computed(
    () => this.sessionStore.hasPermission('accounts.view') && this.canUseAccounts(),
  );

  // Features (Capability ∩ RBAC)
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseView('accounts.features.moduleInfo') ?? true,
  );
  readonly showSearch = computed(
    () => this.capabilityService?.canUseView('accounts.features.search') ?? true,
  );
  readonly showStatusFilter = computed(
    () => this.capabilityService?.canUseView('accounts.features.statusFilter') ?? true,
  );
  readonly showKpiCards = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canUseView('accounts.features.kpiCards') ?? true),
  );

  // Fields
  readonly showName = computed(
    () => this.capabilityService?.canViewField('accounts.fields.name') ?? true,
  );
  readonly showAccountType = computed(
    () => this.capabilityService?.canViewField('accounts.fields.accountType') ?? true,
  );
  readonly showStatus = computed(
    () => this.capabilityService?.canViewField('accounts.fields.status') ?? true,
  );
  readonly showDerivedBalance = computed(
    () => this.capabilityService?.canViewField('accounts.fields.derivedBalance') ?? true,
  );
  readonly showBankName = computed(
    () => this.capabilityService?.canViewField('accounts.fields.bankName') ?? true,
  );
  readonly showAccountNumberMasked = computed(
    () => this.capabilityService?.canViewField('accounts.fields.accountNumberMasked') ?? true,
  );
  readonly showWalletIdentifier = computed(
    () => this.capabilityService?.canViewField('accounts.fields.walletIdentifier') ?? true,
  );
  readonly showOpeningBalance = computed(
    () => this.capabilityService?.canViewField('accounts.fields.openingBalance') ?? true,
  );

  // Actions (Capability ∩ RBAC)
  readonly canCreate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('accounts.actions.create') ?? true),
  );
  readonly canInspect = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('accounts.actions.inspect') ?? true),
  );
  readonly canEdit = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('accounts.actions.edit') ?? true),
  );
  readonly canDeactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('accounts.actions.deactivate') ?? true),
  );
  readonly canReactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('accounts.actions.reactivate') ?? true),
  );
  readonly canDelete = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('accounts.actions.delete') ?? true),
  );
  readonly canRefresh = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('accounts.actions.refresh') ?? true),
  );

  // Treasury Primary Action Permissions (Capability ∩ RBAC)
  readonly canPostTransaction = computed(
    () =>
      this.sessionStore.hasPermission('accounts.transaction.post') &&
      this.canUseAccounts() &&
      (this.capabilityService?.canPerformAction('accounts.actions.postManualMovement') ?? true),
  );
  readonly canTransfer = computed(
    () =>
      this.sessionStore.hasPermission('accounts.transfer') &&
      this.canUseAccounts() &&
      (this.capabilityService?.canPerformAction('accounts.actions.transfer') ?? true),
  );
  readonly canAddMoney = computed(() => this.canPostTransaction());
  readonly canWithdrawMoney = computed(() => this.canPostTransaction());
  readonly canAdjustBalance = computed(() => this.canPostTransaction());
  readonly canTransferMoney = computed(() => this.canTransfer());

  // Liquid position derived summary
  readonly totalCash = computed(() => {
    const cashAccounts = this.items().filter((a) => a.status === 'active' && a.accountType === 'cash');
    const sum = cashAccounts.reduce((acc, curr) => acc + Number(curr.derivedBalances?.balance?.amount ?? 0), 0);
    return sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  readonly totalBank = computed(() => {
    const bankAccounts = this.items().filter((a) => a.status === 'active' && a.accountType === 'bank');
    const sum = bankAccounts.reduce((acc, curr) => acc + Number(curr.derivedBalances?.balance?.amount ?? 0), 0);
    return sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  readonly otherLiquid = computed(() => {
    const otherAccounts = this.items().filter(
      (a) => a.status === 'active' && (a.accountType === 'jazzcash' || a.accountType === 'easypaisa'),
    );
    const sum = otherAccounts.reduce((acc, curr) => acc + Number(curr.derivedBalances?.balance?.amount ?? 0), 0);
    return sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  readonly totalLiquidFunds = computed(() => {
    const liquid = this.summary()?.totalLiquidFunds;
    if (liquid) {
      const val = Number(liquid.amount);
      return isNaN(val)
        ? liquid.amount
        : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return this.formatSummaryBalance();
  });

  openTransfer(accountId?: string): void {
    this.closeMenu();
    this.actionAccountId.set(accountId);
    this.transferDialogOpen.set(true);
  }

  openAddMoney(accountId?: string): void {
    this.closeMenu();
    this.actionAccountId.set(accountId);
    this.addMoneyDialogOpen.set(true);
  }

  openWithdrawMoney(accountId?: string): void {
    this.closeMenu();
    this.actionAccountId.set(accountId);
    this.withdrawMoneyDialogOpen.set(true);
  }

  openAdjustBalance(accountId?: string): void {
    this.closeMenu();
    this.actionAccountId.set(accountId);
    this.adjustBalanceDialogOpen.set(true);
  }

  onTreasuryActionSuccess(message: string): void {
    this.successMessage.set(message);
    this.reload(true);
  }

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

  reload(forceRefresh = false): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view accounts.');
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.closeMenu();

    const params: { page: number; pageSize: number; status?: string; search?: string; forceRefresh?: boolean } = {
      page: this.page(),
      pageSize: this.pageSize(),
      forceRefresh,
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

    if (this.showKpiCards()) {
      this.api.getSummary({ forceRefresh }).subscribe({
        next: (summary) => this.summary.set(summary),
        error: () => this.summary.set(null),
      });
    } else {
      this.summary.set(null);
    }
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

  formatSummaryBalance(): string {
    const balance = this.summary()?.totalBalance;
    if (!balance) return '—';
    const value = Number(balance.amount);
    if (isNaN(value)) return `${balance.currency} ${balance.amount}`;
    return `${balance.currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
