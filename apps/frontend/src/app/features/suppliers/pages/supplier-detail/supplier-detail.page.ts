import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SuppliersApi } from '../../data-access/suppliers.api';
import { SupplierFinanceApi } from '../../data-access/supplier-finance.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import {
  SupplierRecord,
  SupplierRefundRecord,
} from '../../models/suppliers.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { RecordSupplierRefundDialogComponent } from '../../components/record-supplier-refund-dialog/record-supplier-refund-dialog.component';
import { ReverseSupplierRefundDialogComponent } from '../../components/reverse-supplier-refund-dialog/reverse-supplier-refund-dialog.component';
import { AdjustSupplierBalanceDialogComponent } from '../../components/adjust-supplier-balance-dialog/adjust-supplier-balance-dialog.component';

@Component({
  selector: 'agrivio-supplier-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    RecordSupplierRefundDialogComponent,
    ReverseSupplierRefundDialogComponent,
    AdjustSupplierBalanceDialogComponent,
  ],
  templateUrl: './supplier-detail.page.html',
  styleUrl: './supplier-detail.page.scss',
})
export class SupplierDetailPage {
  private readonly api = inject(SuppliersApi);
  private readonly financeApi = inject(SupplierFinanceApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly supplier = signal<SupplierRecord | null>(null);

  // Supplier refunds
  readonly refunds = signal<SupplierRefundRecord[]>([]);
  readonly loadingRefunds = signal(false);
  readonly accountsMap = signal<Map<string, string>>(new Map());

  // Dialog open signals
  readonly recordRefundOpen = signal(false);
  readonly adjustBalanceOpen = signal(false);
  readonly reverseRefundOpen = signal(false);
  readonly selectedRefund = signal<SupplierRefundRecord | null>(null);

  readonly selectedRefundAccountName = computed(() => {
    const r = this.selectedRefund();
    if (!r) return null;
    return this.accountsMap().get(r.accountId) ?? r.accountId;
  });

  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('suppliers.view') &&
      (this.capabilityService?.canUseModule('suppliers') ?? true) &&
      (this.capabilityService?.canPerformAction('suppliers.actions.inspect') ?? true),
  );

  readonly canEdit = computed(
    () =>
      this.sessionStore.hasPermission('suppliers.manage') &&
      (this.capabilityService?.canUseModule('suppliers') ?? true) &&
      (this.capabilityService?.canPerformAction('suppliers.actions.edit') ?? true),
  );

  readonly canPaySupplier = computed(
    () =>
      this.sessionStore.hasPermission('supplier-payments.post') &&
      (this.capabilityService?.canUseModule('payments.supplier') ?? true) &&
      (this.capabilityService?.canPerformAction('payments.supplier.actions.post') ?? true),
  );

  readonly canRecordRefund = computed(
    () =>
      this.sessionStore.hasPermission('supplier-payments.post') &&
      this.sessionStore.hasPermission('accounts.transaction.post') &&
      (this.capabilityService?.canUseModule('payments.supplier') ?? true) &&
      (this.capabilityService?.canPerformAction('payments.supplier.actions.post') ?? true),
  );

  readonly canReverseRefund = computed(
    () =>
      this.sessionStore.hasPermission('payments.correct') &&
      this.sessionStore.hasPermission('accounts.transaction.correct') &&
      (this.capabilityService?.canUseModule('payments.supplier') ?? true) &&
      (this.capabilityService?.canPerformAction('payments.supplier.actions.correct') ?? true),
  );

  readonly canAdjustBalance = computed(
    () =>
      this.sessionStore.hasPermission('suppliers.manage') &&
      (this.capabilityService?.canUseModule('suppliers') ?? true) &&
      (this.capabilityService?.canPerformAction('suppliers.actions.edit') ?? true),
  );

  readonly canViewRefunds = computed(
    () => this.sessionStore.hasPermission('supplier-payments.view'),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }
    this.reloadSupplier(id);
    this.loadAccounts();
    if (this.canViewRefunds()) {
      this.loadRefunds(id);
    }
  }

  reloadSupplier(id: string): void {
    this.api.getSupplier(id).subscribe({
      next: (supplier) => {
        this.supplier.set(supplier);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error));
        this.loading.set(false);
      },
    });
  }

  loadRefunds(supplierId: string): void {
    this.loadingRefunds.set(true);
    this.financeApi.listRefunds({ supplierId }).subscribe({
      next: (res) => {
        this.refunds.set(res.items);
        this.loadingRefunds.set(false);
      },
      error: () => {
        this.loadingRefunds.set(false);
      },
    });
  }

  loadAccounts(): void {
    this.accountsApi.listAccountOptions().subscribe({
      next: (accounts) => {
        const map = new Map<string, string>();
        for (const a of accounts) {
          map.set(a.id, a.name);
        }
        this.accountsMap.set(map);
      },
    });
  }

  getAccountName(accountId: string): string {
    return this.accountsMap().get(accountId) ?? accountId;
  }

  statusTone(status: string): UiBadgeTone {
    return status === 'active' ? 'success' : 'neutral';
  }

  formatMoney(amount: string | undefined, currency = 'PKR'): string {
    if (!amount) return '—';
    const n = Number(amount);
    return Number.isFinite(n)
      ? `${currency} ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${currency} ${amount}`;
  }

  canViewField(field: string): boolean {
    return this.capabilityService && typeof this.capabilityService.canViewField === 'function'
      ? this.capabilityService.canViewField(`suppliers.fields.${field}`)
      : true;
  }

  onRefundRecorded(): void {
    const s = this.supplier();
    if (s) {
      this.reloadSupplier(s.id);
      this.loadRefunds(s.id);
    }
  }

  onBalanceAdjusted(): void {
    const s = this.supplier();
    if (s) {
      this.reloadSupplier(s.id);
    }
  }

  openReverseRefund(refund: SupplierRefundRecord): void {
    this.selectedRefund.set(refund);
    this.reverseRefundOpen.set(true);
  }

  onRefundReversed(): void {
    const s = this.supplier();
    if (s) {
      this.reloadSupplier(s.id);
      this.loadRefunds(s.id);
    }
  }

  private mapError(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? (error.error?.error?.message ?? 'Unable to load supplier details.')
      : 'Unable to load supplier details.';
  }
}
