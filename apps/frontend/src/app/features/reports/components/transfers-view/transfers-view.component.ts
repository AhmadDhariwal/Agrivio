import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDatePipe } from '../../../../shared/format/date-time.pipe';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { ReportDataset } from '../../models/reports.models';

@Component({
  selector: 'agrivio-transfers-view',
  standalone: true,
  imports: [CommonModule, AppDatePipe, UiPaginationComponent, UiEmptyStateComponent],
  template: `
    <div class="transfers-report" data-testid="transfers-report-view">
      <!-- Header -->
      <div class="transfers-head">
        <h2 class="transfers-title" data-testid="transfers-title">Account Transfers</h2>
        <p class="transfers-subtitle">
          Business transfer records between company cash and bank accounts.
        </p>
      </div>

      <!-- Transfer Semantics Banner -->
      <div class="notice-banner" role="note" data-testid="transfer-notice">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          Internal transfers move money between Agrivio accounts and do not change Total Liquid Funds.
        </span>
      </div>

      <!-- Transfers Table -->
      @if (!dataset()?.rows?.length) {
        <div class="empty-wrap">
          <agrivio-ui-empty-state
            title="No transfers found"
            message="No account transfers match the selected filter criteria."
          />
        </div>
      } @else {
        <div class="table-wrap">
          <div class="table-scroll">
            <table class="data-table" data-testid="account-transfers-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">From Account</th>
                  <th scope="col">To Account</th>
                  <th scope="col" class="text-right">Amount (PKR)</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created By</th>
                  <th scope="col">Reversal Status</th>
                </tr>
              </thead>
              <tbody>
                @for (row of dataset()!.rows; track (row.id ?? $index)) {
                  <tr class="transfer-row" [class.row-reversed]="row.status === 'reversed'">
                    <td class="date-cell">{{ row.businessDate | agDate }}</td>
                    <td>
                      <strong class="account-name">{{ row.fromAccount?.name ?? '—' }}</strong>
                    </td>
                    <td>
                      <strong class="account-name">{{ row.toAccount?.name ?? '—' }}</strong>
                    </td>
                    <td class="text-right num-cell transfer-amount">
                      PKR {{ formatMoney(getTransferAmount(row)) }}
                    </td>
                    <td>
                      <span class="ref-badge">{{ row.reference || '—' }}</span>
                    </td>
                    <td>
                      <span
                        class="status-pill"
                        [ngClass]="'status-pill--' + (row.status === 'reversed' ? 'reversed' : 'posted')"
                      >
                        {{ row.status === 'reversed' ? 'Reversed' : 'Posted' }}
                      </span>
                    </td>
                    <td>
                      <span class="created-by">{{ row.createdBy || '—' }}</span>
                    </td>
                    <td>
                      <span
                        class="reversal-pill"
                        [ngClass]="row.reversal ? 'reversal-pill--reversed' : 'reversal-pill--active'"
                      >
                        {{ row.reversal ? 'Reversed' : 'Active' }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          @if (total() > 0) {
            <div class="pagination-container">
              <agrivio-ui-pagination
                [page]="page()"
                [pageSize]="pageSize()"
                [total]="total()"
                [disabled]="loading()"
                (pageChange)="pageChange.emit($event)"
                (pageSizeChange)="pageSizeChange.emit($event)"
              />
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .transfers-report {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .transfers-head {
      border-bottom: 1px solid var(--ag-border, #e2e8f0);
      padding-bottom: 0.75rem;
    }
    .transfers-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--ag-text-primary, #0f172a);
      margin: 0;
    }
    .transfers-subtitle {
      font-size: 0.875rem;
      color: var(--ag-text-muted, #64748b);
      margin: 0.25rem 0 0 0;
    }
    .notice-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #64748b;
      border-radius: 6px;
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      color: #334155;
    }
    .table-wrap {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .table-scroll {
      overflow-x: auto;
      border: 1px solid var(--ag-border, #e2e8f0);
      border-radius: 8px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      background: var(--ag-surface, #ffffff);
    }
    .data-table th, .data-table td {
      padding: 0.65rem 0.9rem;
      border-bottom: 1px solid var(--ag-border, #e2e8f0);
      text-align: left;
    }
    .data-table th {
      background: var(--ag-bg-subtle, #f8fafc);
      color: var(--ag-text-secondary, #475569);
      font-weight: 600;
      font-size: 0.775rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .transfer-row:hover { background: #f8fafc; }
    .row-reversed { opacity: 0.75; background: #fafafa; }
    .date-cell { white-space: nowrap; color: #475569; }
    .account-name { color: #0f172a; font-weight: 600; }
    .transfer-amount { font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
    .ref-badge { font-family: monospace; font-size: 0.8rem; color: #64748b; }
    .text-right { text-align: right !important; }
    .num-cell { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .status-pill {
      font-size: 0.725rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
    }
    .status-pill--posted { background: #dcfce7; color: #15803d; }
    .status-pill--reversed { background: #f1f5f9; color: #64748b; text-decoration: line-through; }
    .reversal-pill {
      font-size: 0.725rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
    }
    .reversal-pill--active { background: #e0f2fe; color: #0369a1; }
    .reversal-pill--reversed { background: #fee2e2; color: #b91c1c; }
    .created-by { font-size: 0.8rem; color: #64748b; }
    .pagination-container { display: flex; justify-content: flex-end; }
    .empty-wrap { padding: 2rem 0; }
  `]
})
export class TransfersViewComponent {
  readonly dataset = input<ReportDataset | null>(null);
  readonly page = input<number>(1);
  readonly pageSize = input<number>(25);
  readonly total = input<number>(0);
  readonly loading = input<boolean>(false);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  formatMoney(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '0.00';
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(num)) return String(value);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  getTransferAmount(row: any): string | undefined {
    return row?.amount?.amount ?? (typeof row?.amount === 'string' ? row.amount : undefined);
  }
}
