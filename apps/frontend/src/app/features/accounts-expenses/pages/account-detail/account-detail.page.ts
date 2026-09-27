import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountsApi } from '../../data-access/accounts.api';
import { AccountRecord } from '../../models/accounts.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { TransferMoneyDialogComponent } from '../../components/transfer-money-dialog/transfer-money-dialog.component';
import { AddMoneyDialogComponent } from '../../components/add-money-dialog/add-money-dialog.component';
import { WithdrawMoneyDialogComponent } from '../../components/withdraw-money-dialog/withdraw-money-dialog.component';
import { AdjustBalanceDialogComponent } from '../../components/adjust-balance-dialog/adjust-balance-dialog.component';
import { AccountMovementsTableComponent } from '../../components/account-movements-table/account-movements-table.component';

@Component({
  selector: 'agrivio-account-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    TransferMoneyDialogComponent,
    AddMoneyDialogComponent,
    WithdrawMoneyDialogComponent,
    AdjustBalanceDialogComponent,
    AccountMovementsTableComponent,
  ],
  templateUrl: './account-detail.page.html',
  styleUrl: './account-detail.page.scss',
})
export class AccountDetailPage {
  private readonly api = inject(AccountsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly account = signal<AccountRecord | null>(null);

  readonly transferDialogOpen = signal(false);
  readonly addMoneyDialogOpen = signal(false);
  readonly withdrawMoneyDialogOpen = signal(false);
  readonly adjustBalanceDialogOpen = signal(false);

  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('accounts.view') &&
      (this.capabilityService?.canUseModule('accounts') ?? true) &&
      (this.capabilityService?.canPerformAction('accounts.actions.inspect') ?? true),
  );

  readonly canEdit = computed(
    () =>
      this.sessionStore.hasPermission('accounts.manage') &&
      (this.capabilityService?.canUseModule('accounts') ?? true) &&
      (this.capabilityService?.canPerformAction('accounts.actions.edit') ?? true),
  );
  readonly canOpenActivity = computed(
    () =>
      this.canView(),
  );

  readonly canPostTransaction = computed(
    () =>
      this.sessionStore.hasPermission('accounts.transaction.post') &&
      this.canView() &&
      (this.capabilityService?.canPerformAction('accounts.actions.postManualMovement') ?? true),
  );
  readonly canTransfer = computed(
    () =>
      this.sessionStore.hasPermission('accounts.transfer') &&
      this.canView() &&
      (this.capabilityService?.canPerformAction('accounts.actions.transfer') ?? true),
  );
  readonly canAddMoney = computed(() => this.canPostTransaction());
  readonly canWithdrawMoney = computed(() => this.canPostTransaction());
  readonly canAdjustBalance = computed(() => this.canPostTransaction());
  readonly canTransferMoney = computed(() => this.canTransfer());

  constructor() {
    this.reload();
  }

  reload(): void {
    const id = this.account()?.id || this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }
    this.api.getAccount(id).subscribe({
      next: (account) => {
        this.account.set(account);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error));
        this.loading.set(false);
      },
    });
  }

  openTransfer(): void {
    this.transferDialogOpen.set(true);
  }

  openAddMoney(): void {
    this.addMoneyDialogOpen.set(true);
  }

  openWithdrawMoney(): void {
    this.withdrawMoneyDialogOpen.set(true);
  }

  openAdjustBalance(): void {
    this.adjustBalanceDialogOpen.set(true);
  }

  onTreasuryActionSuccess(message: string): void {
    this.successMessage.set(message);
    this.reload();
  }

  statusTone(status: string): UiBadgeTone {
    return status === 'active' ? 'success' : 'neutral';
  }

  accountTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      cash: 'Cash',
      bank: 'Bank',
      jazzcash: 'JazzCash',
      easypaisa: 'Easypaisa',
    };
    return labels[type] ?? type;
  }

  formatMoney(amount: string | undefined, currency = 'PKR'): string {
    if (!amount) return '—';
    const n = Number(amount);
    return Number.isFinite(n)
      ? `${currency} ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${currency} ${amount}`;
  }

  canViewField(field: string): boolean {
    return this.capabilityService?.canViewField(`accounts.fields.${field}`) ?? true;
  }

  private mapError(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? (error.error?.error?.message ?? 'Unable to load account details.')
      : 'Unable to load account details.';
  }
}
