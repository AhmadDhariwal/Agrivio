import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDatePipe, AppTimePipe } from '../../../../shared/format/date-time.pipe';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { ReportDataset } from '../../models/reports.models';

@Component({
  selector: 'agrivio-account-statement-view',
  standalone: true,
  imports: [CommonModule, AppDatePipe, AppTimePipe, UiPaginationComponent, UiEmptyStateComponent],
  template: `
    <div class="account-statement" data-testid="account-statement-view">
      <!-- Title & Summary Cards -->
      <div class="statement-head">
        <h2 class="statement-title" data-testid="statement-title">
          {{ dataset()?.title ?? 'Account Statement' }}
        </h2>
      </div>

      <!-- Authoritative Summary Cards -->
      <section class="summary-cards-row" aria-label="Statement Summary" data-testid="statement-summary-cards">
        <div class="kpi-card" data-testid="card-statement-opening">
          <span class="kpi-label">Opening Balance</span>
          <strong class="kpi-value" data-testid="statement-opening-balance">
            PKR {{ formatMoney(dataset()?.openingBalance?.amount) }}
          </strong>
          <span class="kpi-meta">Before period start</span>
        </div>

        <div class="kpi-card" data-testid="card-statement-inflow">
          <span class="kpi-label">Total Inflow</span>
          <strong class="kpi-value kpi-value--inflow" data-testid="statement-total-inflow">
            + PKR {{ formatMoney(dataset()?.periodInflow?.amount) }}
          </strong>
          <span class="kpi-meta">Money added / received</span>
        </div>

        <div class="kpi-card" data-testid="card-statement-outflow">
          <span class="kpi-label">Total Outflow</span>
          <strong class="kpi-value kpi-value--outflow" data-testid="statement-total-outflow">
            − PKR {{ formatMoney(dataset()?.periodOutflow?.amount) }}
          </strong>
          <span class="kpi-meta">Money withdrawn / paid</span>
        </div>

        <div class="kpi-card" data-testid="card-statement-net">
          <span class="kpi-label">Net Change</span>
          <strong class="kpi-value" data-testid="statement-net-change">
            PKR {{ formatSignedMoney(dataset()?.periodNetChange?.amount) }}
          </strong>
          <span class="kpi-meta">Inflow less outflow</span>
        </div>

        <div class="kpi-card kpi-card--closing" data-testid="card-statement-closing">
          <span class="kpi-label">Closing Balance</span>
          <strong class="kpi-value kpi-value--large" data-testid="statement-closing-balance">
            PKR {{ formatMoney(dataset()?.closingBalance?.amount) }}
          </strong>
          <span class="kpi-meta">End of period balance</span>
        </div>
      </section>

      <!-- Statement Movements Table -->
      @if (!dataset()?.rows?.length) {
        <div class="empty-wrap">
          <agrivio-ui-empty-state
            title="No movements recorded"
            message="No financial movements match the selected account and period filters."
          />
        </div>
      } @else {
        <div class="table-wrap">
          <div class="table-scroll">
            <table class="data-table" data-testid="account-statement-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Time</th>
                  <th scope="col">Type</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Description</th>
                  <th scope="col" class="text-right">In (PKR)</th>
                  <th scope="col" class="text-right">Out (PKR)</th>
                  <th scope="col" class="text-right">Running Balance</th>
                  <th scope="col" class="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (row of dataset()!.rows; track (row.id ?? $index)) {
                  <tr class="statement-row" [class.row-reversed]="row.status === 'reversed'">
                    <td class="date-cell">{{ row.businessDate | agDate }}</td>
                    <td class="time-cell">{{ row.postedAt | agTime }}</td>
                    <td>
                      <span class="type-tag">{{ row.sourceLabel ?? row.sourceType }}</span>
                    </td>
                    <td>
                      <span class="ref-badge">{{ row.reference || '—' }}</span>
                    </td>
                    <td class="desc-cell">{{ row.description || '—' }}</td>
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
                    <td class="text-right num-cell running-balance-cell">
                      PKR {{ formatMoney(getRunningBalance(row)) }}
                    </td>
                    <td class="text-center">
                      <span
                        class="status-badge"
                        [ngClass]="'status-badge--' + (row.status === 'reversed' ? 'reversed' : 'posted')"
                      >
                        {{ row.status === 'reversed' ? 'Reversed' : 'Posted' }}
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
    .account-statement {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .statement-head {
      border-bottom: 1px solid var(--ag-border, #e2e8f0);
      padding-bottom: 0.75rem;
    }
    .statement-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--ag-text-primary, #0f172a);
      margin: 0;
    }
    .summary-cards-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }
    .kpi-card {
      background: var(--ag-surface, #ffffff);
      border: 1px solid var(--ag-border, #e2e8f0);
      border-radius: 8px;
      padding: 0.9rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .kpi-card--closing {
      background: #f8fafc;
      border-color: #0284c7;
    }
    .kpi-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }
    .kpi-value {
      font-size: 1.15rem;
      font-weight: 700;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }
    .kpi-value--inflow { color: #0f766e; }
    .kpi-value--outflow { color: #b91c1c; }
    .kpi-value--large { font-size: 1.25rem; color: #0284c7; }
    .kpi-meta {
      font-size: 0.725rem;
      color: #94a3b8;
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
    .statement-row:hover { background: #f8fafc; }
    .row-reversed { opacity: 0.75; background: #fafafa; }
    .date-cell, .time-cell { white-space: nowrap; color: #475569; }
    .type-tag {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: #f1f5f9;
      color: #334155;
    }
    .ref-badge {
      font-family: monospace;
      font-size: 0.8rem;
      color: #64748b;
    }
    .desc-cell { max-width: 250px; }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }
    .text-muted { color: #94a3b8; }
    .num-cell { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
    .inflow-num { color: #0f766e; }
    .outflow-num { color: #b91c1c; }
    .running-balance-cell { color: #0f172a; font-weight: 700; }
    .status-badge {
      font-size: 0.725rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
    }
    .status-badge--posted { background: #dcfce7; color: #15803d; }
    .status-badge--reversed { background: #f1f5f9; color: #64748b; text-decoration: line-through; }
    .pagination-container {
      display: flex;
      justify-content: flex-end;
    }
    .empty-wrap {
      padding: 2rem 0;
    }
  `]
})
export class AccountStatementViewComponent {
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

  getRunningBalance(row: any): string | undefined {
    return row?.runningBalance?.amount;
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
}
