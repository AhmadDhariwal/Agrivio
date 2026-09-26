import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDatePipe } from '../../../../shared/format/date-time.pipe';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { ReportDataset } from '../../models/reports.models';

@Component({
  selector: 'agrivio-supplier-refunds-view',
  standalone: true,
  imports: [CommonModule, AppDatePipe, UiPaginationComponent, UiEmptyStateComponent],
  template: `
    <div class="refunds-report" data-testid="supplier-refunds-report-view">
      <!-- Header -->
      <div class="report-head">
        <h2 class="report-title" data-testid="supplier-refunds-title">Supplier Refunds</h2>
        <p class="report-subtitle">
          Treasury receipts recovering supplier credit balances or overpayments.
        </p>
      </div>

      <!-- Semantic Notice -->
      <div class="notice-banner" role="note" data-testid="refund-notice">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          Supplier refunds are treasury balance recoveries. They reduce supplier credit/advances and are not counted as sales or operating income.
        </span>
      </div>

      <!-- Refunds Table -->
      @if (!dataset()?.rows?.length) {
        <div class="empty-wrap">
          <agrivio-ui-empty-state
            title="No supplier refunds found"
            message="No supplier refund records match the selected filter criteria."
          />
        </div>
      } @else {
        <div class="table-wrap">
          <div class="table-scroll">
            <table class="data-table" data-testid="supplier-refunds-table">
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col">Date</th>
                  <th scope="col">Reference</th>
                  <th scope="col" class="text-right">Amount (PKR)</th>
                  <th scope="col">Received Into</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reversal</th>
                </tr>
              </thead>
              <tbody>
                @for (row of dataset()!.rows; track (row.id ?? $index)) {
                  <tr class="refund-row" [class.row-reversed]="row.status === 'reversed' || row.reversalOfId">
                    <td>
                      <strong class="supplier-name">{{ getSupplierName(row) }}</strong>
                    </td>
                    <td class="date-cell">{{ (row.businessDate || row.refundDate) | agDate }}</td>
                    <td class="ref-cell">{{ row.reference || row.refundNumber || '—' }}</td>
                    <td class="text-right num-cell font-bold">
                      <span class="movement-direction">+ Inflow</span>
                      PKR {{ formatMoney(getRefundAmount(row)) }}
                    </td>
                    <td class="account-cell">
                      {{ getAccountName(row) }}
                    </td>
                    <td>
                      <span class="status-badge" [class]="'badge-' + normalizeStatus(row.status)">
                        {{ formatStatus(row.status) }}
                      </span>
                    </td>
                    <td class="reversal-cell">
                      @if (row.reversalOfId) {
                        <span class="reversal-pill reversal-pill-active">Reversal</span>
                      } @else if (row.status === 'reversed') {
                        <span class="reversal-pill reversal-pill-reversed">Reversed</span>
                      } @else {
                        <span class="text-muted">Original</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          @if (dataset()?.pagination && dataset()!.pagination!.totalPages > 1) {
            <div class="pagination-footer">
              <agrivio-ui-pagination
                [page]="dataset()!.pagination!.page"
                [pageSize]="dataset()!.pagination!.pageSize"
                [total]="dataset()!.pagination!.total"
                (pageChange)="pageChange.emit($event)"
              />
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .refunds-report {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .report-head {
      margin-bottom: 0.25rem;
    }

    .report-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 0.25rem 0;
    }

    .report-subtitle {
      font-size: 0.875rem;
      color: #64748b;
      margin: 0;
    }

    .notice-banner {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      color: #1e40af;
      line-height: 1.4;
    }

    .notice-banner svg {
      flex-shrink: 0;
      margin-top: 1px;
    }

    .table-wrap {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .table-scroll {
      overflow-x: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      text-align: left;
    }

    .data-table th {
      background: #f8fafc;
      color: #475569;
      font-weight: 600;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #e2e8f0;
      white-space: nowrap;
    }

    .data-table td {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
      vertical-align: middle;
    }

    .data-table tbody tr:hover {
      background: #f8fafc;
    }

    .row-reversed {
      background: #fff8f8;
      opacity: 0.85;
    }

    .supplier-name {
      color: #0f172a;
      font-weight: 600;
    }

    .num-cell {
      font-variant-numeric: tabular-nums;
      font-weight: 500;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.15rem;
    }

    .movement-direction {
      font-size: 0.72rem;
      font-weight: 600;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .font-bold {
      font-weight: 700;
    }

    .text-right {
      text-align: right;
    }

    .text-muted {
      color: #64748b;
    }

    .date-cell, .ref-cell {
      color: #475569;
      white-space: nowrap;
    }

    .account-cell {
      color: #334155;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: capitalize;
    }

    .badge-posted {
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }

    .badge-reversed {
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }

    .reversal-pill {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 600;
    }

    .reversal-pill-active {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
    }

    .reversal-pill-reversed {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fca5a5;
    }

    .pagination-footer {
      padding: 0.75rem 1rem;
      border-top: 1px solid #e2e8f0;
      background: #fafafa;
    }

    .empty-wrap {
      padding: 3rem 1rem;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      text-align: center;
    }
  `],
})
export class SupplierRefundsViewComponent {
  dataset = input<ReportDataset | null>(null);
  pageChange = output<number>();

  getSupplierName(row: any): string {
    return row.supplierName || row.supplier?.name || (row.supplierId ? `Supplier (${row.supplierId})` : '—');
  }

  getAccountName(row: any): string {
    return row.accountName || row.account?.name || row.accountId || '—';
  }

  normalizeStatus(status?: string): string {
    return (status || 'posted').toLowerCase().replace(/\s+/g, '_');
  }

  formatStatus(status?: string): string {
    if (!status) return 'Posted';
    return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  formatMoney(value: any): string {
    if (value === null || value === undefined || value === '') return '0.00';
    const num = Number(value);
    return isNaN(num) ? String(value) : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  getRefundAmount(row: any): string | number | null | undefined {
    return row?.amount?.amount ?? row?.amount;
  }
}
