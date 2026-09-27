import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AppDateTimePipe, AppDatePipe } from '../../../../shared/format/date-time.pipe';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { ReverseTreasuryDialogComponent } from '../reverse-treasury-dialog/reverse-treasury-dialog.component';
import { AccountMovementRecord, AccountRecord } from '../../models/accounts.models';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-account-movements-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppDateTimePipe,
    AppDatePipe,
    UiStatusBadgeComponent,
    UiPaginationComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiAlertComponent,
    ReverseTreasuryDialogComponent,
  ],
  templateUrl: './account-movements-table.component.html',
  styleUrl: './account-movements-table.component.scss',
})
export class AccountMovementsTableComponent {
  private readonly api = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore, { optional: true });
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly accountId = input.required<string>();
  readonly accountName = input<string>('');
  readonly accounts = input<AccountRecord[]>([]);
  readonly canReverseMovement = input<boolean | undefined>(undefined);
  readonly canReverseTransfer = input<boolean | undefined>(undefined);

  readonly canReverseMovementComputed = computed(() => {
    const override = this.canReverseMovement();
    if (override !== undefined) return override;
    return (
      ((this.sessionStore?.hasPermission('accounts.transaction.correct') ??
        this.sessionStore?.hasPermission('accounts.transaction.post')) ??
        true) &&
      ((this.capabilityService?.canPerformAction('accounts.actions.reverseMovement') ??
        this.capabilityService?.canPerformAction('accounts.actions.reverseManualMovement')) ??
        true)
    );
  });

  readonly canReverseTransferComputed = computed(() => {
    const override = this.canReverseTransfer();
    if (override !== undefined) return override;
    return (
      ((this.sessionStore?.hasPermission('accounts.transfer.reverse') ??
        this.sessionStore?.hasPermission('accounts.transfer')) ??
        true) &&
      (this.capabilityService?.canPerformAction('accounts.actions.reverseTransfer') ?? true)
    );
  });

  readonly movementReversed = output<void>();

  readonly movements = signal<AccountMovementRecord[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly searchQuery = signal('');
  readonly directionFilter = signal<'all' | 'inflow' | 'outflow'>('all');
  readonly fromDate = signal('');
  readonly toDate = signal('');

  readonly reversalDialogOpen = signal(false);
  readonly selectedMovementForReversal = signal<AccountMovementRecord | null>(null);

  readonly currentAccountName = computed(() => {
    if (this.accountName()) return this.accountName();
    const acc = this.accounts().find((a) => a.id === this.accountId());
    return acc?.name ?? '';
  });

  readonly hasActiveFilters = computed(() =>
    this.searchQuery() !== '' ||
    this.directionFilter() !== 'all' ||
    this.fromDate() !== '' ||
    this.toDate() !== '',
  );

  constructor() {
    effect(() => {
      const id = this.accountId();
      if (id) {
        this.page.set(1);
        this.reload();
      }
    });
  }

  reload(): void {
    const id = this.accountId();
    if (!id) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    const params: {
      page: number;
      pageSize: number;
      direction?: 'inflow' | 'outflow';
      fromDate?: string;
      toDate?: string;
      search?: string;
      forceRefresh?: boolean;
    } = {
      page: this.page(),
      pageSize: this.pageSize(),
      forceRefresh: true,
    };

    const dir = this.directionFilter();
    if (dir === 'inflow' || dir === 'outflow') {
      params.direction = dir;
    }
    if (this.fromDate()) {
      params.fromDate = this.fromDate();
    }
    if (this.toDate()) {
      params.toDate = this.toDate();
    }
    if (this.searchQuery()) {
      params.search = this.searchQuery();
    }

    this.api.listMovements(id, params).subscribe({
      next: ({ items, meta }) => {
        this.movements.set(items);
        this.total.set(meta.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load account movements.')
            : 'Unable to load account movements.',
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

  onSearchChange(q: string): void {
    this.searchQuery.set(q);
    this.page.set(1);
    this.reload();
  }

  onDirectionChange(dir: 'all' | 'inflow' | 'outflow'): void {
    this.directionFilter.set(dir);
    this.page.set(1);
    this.reload();
  }

  onFromDateChange(d: string): void {
    this.fromDate.set(d);
    this.page.set(1);
    this.reload();
  }

  onToDateChange(d: string): void {
    this.toDate.set(d);
    this.page.set(1);
    this.reload();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.directionFilter.set('all');
    this.fromDate.set('');
    this.toDate.set('');
    this.page.set(1);
    this.reload();
  }

  isInflow(item: AccountMovementRecord): boolean {
    if (item.direction) return item.direction === 'inflow';
    return Number(item.signedAmount.amount) >= 0;
  }

  formatAmount(val: string): string {
    const num = Math.abs(Number(val));
    if (isNaN(num)) return val;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  getTransactionTitle(item: AccountMovementRecord): string {
    switch (item.sourceType) {
      case 'account_transfer_out':
      case 'account_transfer_in':
        return 'Internal Transfer';
      case 'manual_inflow':
        return 'External Money Added';
      case 'manual_outflow':
        return 'External Money Withdrawn';
      case 'account_transaction_manual':
        return this.isInflow(item) ? 'External Money Added' : 'External Money Withdrawn';
      case 'balance_adjustment_increase':
      case 'balance_adjustment_decrease':
      case 'account_balance_adjustment':
        return 'Balance Adjustment';
      case 'account_transfer_reversal':
      case 'account_transfer_out_reversal':
      case 'account_transfer_in_reversal':
        return 'Transfer Reversal';
      case 'manual_inflow_reversal':
      case 'manual_outflow_reversal':
      case 'balance_adjustment_increase_reversal':
      case 'balance_adjustment_decrease_reversal':
      case 'account_balance_adjustment_reversal':
        return 'Adjustment Reversal';
      case 'opening_balance':
      case 'account_opening':
        return 'Opening Balance';
      case 'expense':
        return 'Operating Expense';
      case 'expense_correction':
        return 'Expense Correction';
      case 'customer_payment':
        return 'Customer Payment';
      case 'supplier_payment':
        return 'Supplier Payment';
      default:
        return item.sourceType.replace(/_/g, ' ');
    }
  }

  getTransferSubtext(item: AccountMovementRecord): string | null {
    if (item.sourceType === 'account_transfer_out') {
      return 'Transfer Out (Debit)';
    }
    if (item.sourceType === 'account_transfer_in') {
      return 'Transfer In (Credit)';
    }
    return null;
  }

  getReasonText(item: AccountMovementRecord): string {
    return item.purpose || item.notes || item.reference || '—';
  }

  isReversible(item: AccountMovementRecord): boolean {
    if (item.status === 'reversed') return false;
    if (item.sourceType === 'account_transfer_out' || item.sourceType === 'account_transfer_in') {
      return this.canReverseTransferComputed();
    }
    if (
      item.sourceType === 'manual_inflow' ||
      item.sourceType === 'manual_outflow' ||
      item.sourceType === 'balance_adjustment_increase' ||
      item.sourceType === 'balance_adjustment_decrease' ||
      item.sourceType === 'account_transaction_manual' ||
      item.sourceType === 'account_balance_adjustment'
    ) {
      return this.canReverseMovementComputed();
    }
    return false;
  }

  openReversal(item: AccountMovementRecord): void {
    this.selectedMovementForReversal.set(item);
    this.reversalDialogOpen.set(true);
  }

  onReversalComplete(): void {
    this.reversalDialogOpen.set(false);
    this.selectedMovementForReversal.set(null);
    this.successMessage.set('Movement reversed successfully. Offset record posted.');
    this.movementReversed.emit();
    this.reload();
  }
}
