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
  template: `
    <div class="movements-container" data-testid="account-movements-section">
      <!-- Toolbar Filters -->
      <div class="filter-toolbar">
        <div class="filter-toolbar__filters">
          <!-- Search input -->
          <div class="filter-toolbar__search">
            <svg
              class="filter-toolbar__search-icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              class="filter-toolbar__search-input"
              placeholder="Search by reference, reason, notes…"
              [ngModel]="searchQuery()"
              (ngModelChange)="onSearchChange($event)"
              data-testid="movements-search"
            />
          </div>

          <!-- Direction Filter -->
          <select
            class="filter-toolbar__select"
            [ngModel]="directionFilter()"
            (ngModelChange)="onDirectionChange($event)"
            aria-label="Filter by direction"
            data-testid="movements-direction-filter"
          >
            <option value="all">All Directions</option>
            <option value="inflow">Inflow Only (+)</option>
            <option value="outflow">Outflow Only (-)</option>
          </select>

          <!-- Date Filters -->
          <div class="date-filter-group">
            <input
              type="date"
              class="filter-toolbar__date-input"
              [ngModel]="fromDate()"
              (ngModelChange)="onFromDateChange($event)"
              aria-label="From date"
              placeholder="From"
              data-testid="movements-from-date"
            />
            <span class="date-separator">to</span>
            <input
              type="date"
              class="filter-toolbar__date-input"
              [ngModel]="toDate()"
              (ngModelChange)="onToDateChange($event)"
              aria-label="To date"
              placeholder="To"
              data-testid="movements-to-date"
            />
          </div>
        </div>

        <div class="filter-toolbar__actions">
          @if (hasActiveFilters()) {
            <button class="filter-toolbar__clear" type="button" (click)="clearFilters()">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Clear filters
            </button>
          }
        </div>
      </div>

      <!-- Alerts -->
      @if (errorMessage()) {
        <div class="alert-container">
          <agrivio-ui-alert tone="danger" [message]="errorMessage()!" role="alert" />
        </div>
      }
      @if (successMessage()) {
        <div class="alert-container">
          <agrivio-ui-alert tone="success" [message]="successMessage()!" />
        </div>
      }

      @if (loading()) {
        <div class="state-container">
          <agrivio-ui-loading-state label="Loading movement history…" />
        </div>
      } @else if (movements().length === 0) {
        <agrivio-ui-empty-state
          title="No movements found"
          message="There are no posted movements matching the selected criteria."
        />
      } @else {
        <!-- Desktop Table -->
        <div class="table-container" data-testid="movements-table">
          <table class="ag-table">
            <thead>
              <tr>
                <th class="ag-table__th">Date</th>
                <th class="ag-table__th">Account</th>
                <th class="ag-table__th">Transaction Type</th>
                <th class="ag-table__th">Reference</th>
                <th class="ag-table__th ag-table__th--amount">In (PKR)</th>
                <th class="ag-table__th ag-table__th--amount">Out (PKR)</th>
                <th class="ag-table__th">Reason / Notes</th>
                <th class="ag-table__th">Status</th>
                @if (canReverseMovementComputed() || canReverseTransferComputed()) {
                  <th class="ag-table__th ag-table__th--actions">Actions</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (item of movements(); track item.id) {
                <tr class="ag-table__row" [class.ag-table__row--reversed]="item.status === 'reversed'">
                  <!-- Date -->
                  <td class="ag-table__td ag-table__td--date">
                    <span class="date-main">{{ item.businessDate || item.postedAt | agDate }}</span>
                    <span class="date-sub">{{ item.postedAt | agDateTime }}</span>
                  </td>

                  <!-- Account -->
                  <td class="ag-table__td">
                    <span class="account-name">{{ currentAccountName() || 'Account' }}</span>
                  </td>

                  <!-- Transaction Type -->
                  <td class="ag-table__td">
                    <div class="tx-type-wrap">
                      <span class="tx-title font-medium">{{ getTransactionTitle(item) }}</span>
                      @if (getTransferSubtext(item); as subtext) {
                        <span class="tx-subtext">{{ subtext }}</span>
                      }
                    </div>
                  </td>

                  <!-- Reference -->
                  <td class="ag-table__td">
                    <span class="reference-val">{{ item.reference || '—' }}</span>
                  </td>

                  <!-- In -->
                  <td class="ag-table__td ag-table__td--amount in-col">
                    @if (isInflow(item)) {
                      <span class="amount-val amount-val--in">+{{ formatAmount(item.signedAmount.amount) }}</span>
                    } @else {
                      <span class="amount-val--dash">—</span>
                    }
                  </td>

                  <!-- Out -->
                  <td class="ag-table__td ag-table__td--amount out-col">
                    @if (!isInflow(item)) {
                      <span class="amount-val amount-val--out">-{{ formatAmount(item.signedAmount.amount) }}</span>
                    } @else {
                      <span class="amount-val--dash">—</span>
                    }
                  </td>

                  <!-- Reason / Notes -->
                  <td class="ag-table__td">
                    <div class="reason-notes-cell">
                      <span class="reason-text">{{ getReasonText(item) }}</span>
                      @if (item.category && item.category !== 'unclassified') {
                        <span class="category-badge">{{ item.category }}</span>
                      }
                    </div>
                  </td>

                  <!-- Status -->
                  <td class="ag-table__td">
                    <agrivio-ui-status-badge
                      [label]="item.status === 'reversed' ? 'Reversed' : 'Posted'"
                      [tone]="item.status === 'reversed' ? 'neutral' : 'success'"
                    />
                  </td>

                  <!-- Actions -->
                  @if (canReverseMovementComputed() || canReverseTransferComputed()) {
                    <td class="ag-table__td ag-table__td--actions">
                      @if (isReversible(item)) {
                        <button
                          type="button"
                          class="ag-btn ag-btn--secondary ag-btn--sm"
                          (click)="openReversal(item)"
                          data-testid="reverse-movement-btn"
                        >
                          Reverse
                        </button>
                      } @else {
                        <span class="text-muted">—</span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Mobile Cards -->
        <div class="movement-cards">
          @for (item of movements(); track item.id) {
            <article class="movement-card" [class.movement-card--reversed]="item.status === 'reversed'">
              <div class="movement-card__header">
                <div>
                  <div class="movement-card__title">{{ getTransactionTitle(item) }}</div>
                  <div class="movement-card__date">{{ item.businessDate || item.postedAt | agDate }}</div>
                </div>
                <agrivio-ui-status-badge
                  [label]="item.status === 'reversed' ? 'Reversed' : 'Posted'"
                  [tone]="item.status === 'reversed' ? 'neutral' : 'success'"
                />
              </div>

              @if (getTransferSubtext(item); as subtext) {
                <div class="movement-card__subtext">{{ subtext }}</div>
              }

              <div class="movement-card__body">
                <div class="movement-card__row">
                  <span class="movement-card__label">Amount</span>
                  @if (isInflow(item)) {
                    <span class="amount-val amount-val--in">+PKR {{ formatAmount(item.signedAmount.amount) }}</span>
                  } @else {
                    <span class="amount-val amount-val--out">-PKR {{ formatAmount(item.signedAmount.amount) }}</span>
                  }
                </div>
                @if (item.reference) {
                  <div class="movement-card__row">
                    <span class="movement-card__label">Reference</span>
                    <span>{{ item.reference }}</span>
                  </div>
                }
                <div class="movement-card__row">
                  <span class="movement-card__label">Reason / Purpose</span>
                  <span>{{ getReasonText(item) }}</span>
                </div>
              </div>

              @if (isReversible(item)) {
                <div class="movement-card__actions">
                  <button
                    type="button"
                    class="ag-btn ag-btn--secondary ag-btn--sm"
                    (click)="openReversal(item)"
                  >
                    Reverse
                  </button>
                </div>
              }
            </article>
          }
        </div>

        <!-- Pagination -->
        <agrivio-ui-pagination
          [page]="page()"
          [pageSize]="pageSize()"
          [total]="total()"
          [disabled]="loading()"
          (pageChange)="onPageChange($event)"
          (pageSizeChange)="onPageSizeChange($event)"
        />
      }

      <!-- Reverse Treasury Dialog -->
      <agrivio-reverse-treasury-dialog
        [open]="reversalDialogOpen()"
        [movement]="selectedMovementForReversal()"
        [accounts]="accounts()"
        (dismiss)="reversalDialogOpen.set(false)"
        (reversed)="onReversalComplete()"
      />
    </div>
  `,
  styles: [`
    .movements-container {
      display: flex;
      flex-direction: column;
      gap: 14px;
      width: 100%;
    }
    .filter-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
    }
    .filter-toolbar__filters {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      flex: 1;
    }
    .filter-toolbar__search {
      position: relative;
      min-width: 220px;
      flex: 1 1 220px;
    }
    .filter-toolbar__search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: #94a3b8;
      pointer-events: none;
    }
    .filter-toolbar__search-input {
      width: 100%;
      height: 36px;
      padding: 0 10px 0 32px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13px;
      color: #0f172a;
      background: #ffffff;
      outline: none;
      box-sizing: border-box;
    }
    .filter-toolbar__search-input:focus {
      border-color: #065f46;
    }
    .filter-toolbar__select {
      height: 36px;
      padding: 0 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13px;
      color: #0f172a;
      background: #ffffff;
      outline: none;
    }
    .date-filter-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .filter-toolbar__date-input {
      height: 36px;
      padding: 0 8px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13px;
      color: #0f172a;
      background: #ffffff;
      outline: none;
    }
    .date-separator {
      font-size: 12px;
      color: #64748b;
    }
    .filter-toolbar__clear {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12.5px;
      color: #64748b;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .filter-toolbar__clear:hover {
      color: #0f172a;
      background: #e2e8f0;
    }
    .table-container {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #ffffff;
    }
    .ag-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }
    .ag-table__th {
      padding: 10px 14px;
      background: #f8fafc;
      color: #475569;
      font-weight: 600;
      border-bottom: 1px solid #e2e8f0;
      white-space: nowrap;
    }
    .ag-table__th--amount {
      text-align: right;
    }
    .ag-table__th--actions {
      text-align: right;
      width: 90px;
    }
    .ag-table__td {
      padding: 10px 14px;
      border-bottom: 1px solid #f1f5f9;
      color: #0f172a;
      vertical-align: middle;
    }
    .ag-table__td--date {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .date-main {
      font-weight: 500;
      color: #0f172a;
    }
    .date-sub {
      font-size: 11px;
      color: #64748b;
    }
    .ag-table__td--amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .ag-table__td--actions {
      text-align: right;
    }
    .ag-table__row--reversed {
      background: #fafafa;
      opacity: 0.75;
    }
    .tx-type-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .tx-title {
      color: #0f172a;
    }
    .tx-subtext {
      font-size: 11.5px;
      color: #64748b;
    }
    .amount-val--in {
      color: #059669;
    }
    .amount-val--out {
      color: #dc2626;
    }
    .amount-val--dash {
      color: #94a3b8;
    }
    .reason-notes-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-width: 260px;
    }
    .reason-text {
      font-size: 12.5px;
      color: #334155;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .category-badge {
      display: inline-block;
      font-size: 10.5px;
      color: #64748b;
      background: #f1f5f9;
      padding: 1px 6px;
      border-radius: 4px;
      width: fit-content;
      text-transform: capitalize;
    }
    .text-muted {
      color: #94a3b8;
    }
    .movement-cards {
      display: none;
      flex-direction: column;
      gap: 10px;
    }
    .movement-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .movement-card--reversed {
      background: #fafafa;
      opacity: 0.75;
    }
    .movement-card__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .movement-card__title {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }
    .movement-card__date {
      font-size: 12px;
      color: #64748b;
    }
    .movement-card__subtext {
      font-size: 12px;
      color: #475569;
      background: #f8fafc;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .movement-card__body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
    }
    .movement-card__row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .movement-card__label {
      color: #64748b;
      font-size: 12px;
    }
    .movement-card__actions {
      display: flex;
      justify-content: flex-end;
      padding-top: 6px;
      border-top: 1px solid #f1f5f9;
    }
    .ag-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #334155;
      cursor: pointer;
    }
    .ag-btn:hover {
      background: #f8fafc;
      color: #0f172a;
    }
    @media (max-width: 800px) {
      .table-container {
        display: none;
      }
      .movement-cards {
        display: flex;
      }
    }
  `],
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
