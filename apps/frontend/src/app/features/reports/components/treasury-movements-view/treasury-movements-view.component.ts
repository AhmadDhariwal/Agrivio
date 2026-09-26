import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDatePipe } from '../../../../shared/format/date-time.pipe';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { ReportDataset } from '../../models/reports.models';

@Component({
  selector: 'agrivio-treasury-movements-view',
  standalone: true,
  imports: [CommonModule, AppDatePipe, UiPaginationComponent, UiEmptyStateComponent],
  template: `
    <div class="treasury-movements" data-testid="treasury-movements-view">
      <!-- Header -->
      <div class="movements-head">
        <h2 class="movements-title" data-testid="treasury-movements-title">Treasury Movements</h2>
        <p class="movements-subtitle">
          Comprehensive, chronological history of all account-level movements across organization accounts.
        </p>
      </div>

      <!-- Unclassified Treasury Summary Banner -->
      @if (dataset()?.summary; as sum) {
        <div class="unclass-banner" data-testid="treasury-unclassified-banner">
          <div class="unclass-banner__header">
            <span class="unclass-pill">Treasury Diagnostic</span>
            <h3 class="unclass-title">Unclassified Treasury Activity</h3>
          </div>
          <p class="unclass-desc" data-testid="unclassified-helper-text">
            Unclassified treasury activity represents manual money movements whose business source was not categorized. It is not automatically treated as revenue or expense.
          </p>
          <div class="unclass-row">
            <div class="unclass-stat">
              <span class="stat-lbl">Unclassified Inflows</span>
              <strong class="stat-val stat-inflow">+ PKR {{ formatMoney(sum['unclassifiedInflow']?.amount) }}</strong>
            </div>
            <div class="unclass-stat">
              <span class="stat-lbl">Unclassified Outflows</span>
              <strong class="stat-val stat-outflow">− PKR {{ formatMoney(sum['unclassifiedOutflow']?.amount) }}</strong>
            </div>
            <div class="unclass-stat unclass-stat--net">
              <span class="stat-lbl">Net Unclassified Movement</span>
              <strong class="stat-val" data-testid="net-unclassified-movement">
                PKR {{ formatSignedMoney(sum['netUnclassifiedTreasuryMovement']?.amount) }}
              </strong>
            </div>
          </div>
        </div>
      }

      <!-- Movements Table -->
      @if (!dataset()?.rows?.length) {
        <div class="empty-wrap">
          <agrivio-ui-empty-state
            title="No movements found"
            message="No treasury movements match the selected filters."
          />
        </div>
      } @else {
        <div class="table-wrap">
          <div class="table-scroll">
            <table class="data-table" data-testid="treasury-movements-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Account</th>
                  <th scope="col">Type</th>
                  <th scope="col">Reference</th>
                  <th scope="col" class="text-right">Inflow (PKR)</th>
                  <th scope="col" class="text-right">Outflow (PKR)</th>
                  <th scope="col" class="text-center">Status</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                @for (row of dataset()!.rows; track (row.id ?? $index)) {
                  <tr class="movement-row" [class.row-reversed]="row.status === 'reversed'">
                    <td class="date-cell">{{ row.businessDate | agDate }}</td>
                    <td><strong class="account-cell">{{ row.accountName }}</strong></td>
                    <td><span class="type-badge">{{ row.sourceLabel ?? row.sourceType }}</span></td>
                    <td><span class="ref-badge">{{ row.reference || '—' }}</span></td>
                    <td class="text-right num-cell inflow-num">
                      @if (hasAmount(getInflow(row))) {
                        + {{ formatMoney(getInflow(row)) }}
                      } @else {
                        <span class="text-muted">—</span>
                      }
                    </td>
                    <td class="text-right num-cell outflow-num">
                      @if (hasAmount(getOutflow(row))) {
                        − {{ formatMoney(getOutflow(row)) }}
                      } @else {
                        <span class="text-muted">—</span>
                      }
                    </td>
                    <td class="text-center">
                      <span
                        class="status-pill"
                        [ngClass]="'status-pill--' + (row.status === 'reversed' ? 'reversed' : 'posted')"
                      >
                        {{ row.status === 'reversed' ? 'Reversed' : 'Posted' }}
                      </span>
                    </td>
                    <td><span class="source-tag">{{ formatSource(row.sourceType) }}</span></td>
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
    .treasury-movements {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .movements-head {
      border-bottom: 1px solid var(--ag-border, #e2e8f0);
      padding-bottom: 0.75rem;
    }
    .movements-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--ag-text-primary, #0f172a);
      margin: 0;
    }
    .movements-subtitle {
      font-size: 0.875rem;
      color: var(--ag-text-muted, #64748b);
      margin: 0.25rem 0 0 0;
    }
    .unclass-banner {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-radius: 8px;
      padding: 1rem;
    }
    .unclass-banner__header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }
    .unclass-pill {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      padding: 0.1rem 0.4rem;
      background: #fde68a;
      color: #92400e;
      border-radius: 4px;
    }
    .unclass-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: #92400e;
      margin: 0;
    }
    .unclass-desc {
      font-size: 0.8rem;
      color: #78350f;
      margin: 0 0 0.75rem 0;
      line-height: 1.4;
    }
    .unclass-row {
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
    }
    .unclass-stat {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .stat-lbl {
      font-size: 0.75rem;
      color: #64748b;
    }
    .stat-val {
      font-size: 1.05rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .stat-inflow { color: #0f766e; }
    .stat-outflow { color: #b91c1c; }
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
    .movement-row:hover { background: #f8fafc; }
    .row-reversed { opacity: 0.75; background: #fafafa; }
    .date-cell { white-space: nowrap; color: #475569; }
    .account-cell { color: #0f172a; }
    .type-badge {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: #f1f5f9;
      color: #334155;
    }
    .ref-badge { font-family: monospace; font-size: 0.8rem; color: #64748b; }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }
    .text-muted { color: #94a3b8; }
    .num-cell { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
    .inflow-num { color: #0f766e; }
    .outflow-num { color: #b91c1c; }
    .status-pill {
      font-size: 0.725rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
    }
    .status-pill--posted { background: #dcfce7; color: #15803d; }
    .status-pill--reversed { background: #f1f5f9; color: #64748b; text-decoration: line-through; }
    .source-tag {
      font-size: 0.75rem;
      color: #64748b;
    }
    .pagination-container { display: flex; justify-content: flex-end; }
    .empty-wrap { padding: 2rem 0; }
  `]
})
export class TreasuryMovementsViewComponent {
  readonly dataset = input<ReportDataset | null>(null);
  readonly page = input<number>(1);
  readonly pageSize = input<number>(25);
  readonly total = input<number>(0);
  readonly loading = input<boolean>(false);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  hasAmount(val: string | undefined): boolean {
    if (!val) return false;
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }

  getInflow(row: any): string | undefined {
    return row?.inflow?.amount;
  }

  getOutflow(row: any): string | undefined {
    return row?.outflow?.amount;
  }

  formatMoney(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '0.00';
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(num)) return String(value);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatSignedMoney(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '0.00';
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(num)) return String(value);
    const sign = num > 0 ? '+ ' : num < 0 ? '− ' : '';
    return `${sign}${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatSource(src: string): string {
    if (!src) return '—';
    const dict: Record<string, string> = {
      manual_external_inflow: 'External Money Added',
      manual_external_outflow: 'External Money Withdrawn',
      customer_payment: 'Customer Payment',
      supplier_payment: 'Supplier Payment',
      customer_loan_disbursement: 'Customer Loan',
      supplier_refund: 'Supplier Refund',
      account_transfer_in: 'Account Transfer In',
      account_transfer_out: 'Account Transfer Out',
      manual_balance_adjustment: 'Balance Adjustment',
      expense: 'Expense',
      purchase: 'Purchase',
      sale: 'Sale',
    };
    return dict[src] || src
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
