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

@Component({
  selector: 'agrivio-account-detail-page',
  standalone: true,
  imports: [RouterLink, UiAlertComponent, UiLoadingStateComponent, UiStatusBadgeComponent],
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
  readonly account = signal<AccountRecord | null>(null);

  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('accounts.view') &&
      (this.capabilityService?.canUseModule('accounts') ?? true),
  );

  readonly canEdit = computed(
    () =>
      this.sessionStore.hasPermission('accounts.manage') &&
      (this.capabilityService?.canUseModule('accounts') ?? true) &&
      (this.capabilityService?.canPerformAction('accounts.actions.edit') ?? true),
  );
  readonly canOpenActivity = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('accounts.actions.inspect') ?? true),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
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

  private mapError(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? (error.error?.error?.message ?? 'Unable to load account details.')
      : 'Unable to load account details.';
  }
}
