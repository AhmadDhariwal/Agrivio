import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDatePipe } from '../../../../shared/format/date-time.pipe';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { BALANCE_TYPE_LABELS, ReportDataset } from '../../models/reports.models';

@Component({
  selector: 'agrivio-manual-adjustments-view',
  standalone: true,
  imports: [CommonModule, AppDatePipe, UiPaginationComponent, UiEmptyStateComponent],
  template: `
    <div class="manual-adjustments" data-testid="manual-adjustments-view">
      <!-- Header -->
      <div class="adjustments-head">
        <h2 class="adjustments-title" data-testid="manual-adjustments-title">Manual Financial Adjustments</h2>
        <p class="adjustments-subtitle">
          Cross-domain audit log of manual balance adjustments across accounts, customer balances, and supplier balances.
        </p>
      </div>

      <!-- Adjustments Table -->
      @if (!dataset()?.rows?.length) {
        <div class="empty-wrap">
          <agrivio-ui-empty-state
            title="No manual adjustments found"
            message="No manual financial adjustments match the selected filter criteria."
          />
        </div>
      } @else {
        <div class="table-wrap">
          <div class="table-scroll">
            <table class="data-table" data-testid="manual-adjustments-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Domain</th>
                  <th scope="col">Entity</th>
                  <th scope="col">Balance Type</th>
                  <th scope="col" class="text-right">Before</th>
                  <th scope="col" class="text-right">Adjustment</th>
                  <th scope="col" class="text-right">After</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Reference</th>
                  <th scope="col">User</th>
                  <th scope="col" class="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (row of dataset()!.rows; track (row.id ?? $index)) {
                  <tr class="adjustment-row" [class.row-reversal]="row.status === 'reversal'">
                    <td class="date-cell">{{ row.businessDate | agDate }}</td>
                    <td>
                      <span class="domain-badge" [ngClass]="'domain-badge--' + (row.domain || 'account')">
                        {{ formatDomain(row.domain) }}
                      </span>
                    </td>
                    <td>
                      <strong class="entity-name">{{ row.entity?.name || row.entity?.id || '—' }}</strong>
                    </td>
                    <td>
                      <span class="balance-type">{{ formatBalanceType(row.balanceType) }}</span>
                    </td>
                    <td class="text-right num-cell before-amount">
                      @if (getBeforeAmount(row) !== undefined && getBeforeAmount(row) !== null) {
                        PKR {{ formatMoney(getBeforeAmount(row)) }}
                      } @else {
                        <span class="text-muted" data-testid="null-before-placeholder">—</span>
                      }
                    </td>
                    <td class="text-right num-cell adj-amount">
                      <span [ngClass]="getDeltaColorClass(getDeltaAmount(row))">
                        {{ formatSignedMoney(getDeltaAmount(row)) }}
                      </span>
                    </td>
                    <td class="text-right num-cell after-amount">
                      @if (getAfterAmount(row) !== undefined && getAfterAmount(row) !== null) {
                        PKR {{ formatMoney(getAfterAmount(row)) }}
                      } @else {
                        <span class="text-muted" data-testid="null-after-placeholder">—</span>
                      }
                    </td>
                    <td class="reason-cell">{{ row.reason || row.purpose || '—' }}</td>
                    <td><span class="ref-badge">{{ row.reference || '—' }}</span></td>
                    <td class="user-cell">{{ row.createdBy || '—' }}</td>
                    <td class="text-center">
                      <span
                        class="status-pill"
                        [ngClass]="'status-pill--' + (row.status === 'reversal' ? 'reversal' : 'posted')"
                      >
                        {{ row.status === 'reversal' ? 'Reversal' : 'Posted' }}
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
    .manual-adjustments {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .adjustments-head {
      border-bottom: 1px solid var(--ag-border, #e2e8f0);
      padding-bottom: 0.75rem;
    }
    .adjustments-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--ag-text-primary, #0f172a);
      margin: 0;
    }
    .adjustments-subtitle {
      font-size: 0.875rem;
      color: var(--ag-text-muted, #64748b);
      margin: 0.25rem 0 0 0;
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
    .adjustment-row:hover { background: #f8fafc; }
    .row-reversal { opacity: 0.8; background: #fafafa; }
    .date-cell { white-space: nowrap; color: #475569; }
    .domain-badge {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
    }
    .domain-badge--account { background: #e0f2fe; color: #0369a1; }
    .domain-badge--customer { background: #f3e8ff; color: #7e22ce; }
    .domain-badge--supplier { background: #fef3c7; color: #b45309; }
    .entity-name { color: #0f172a; }
    .balance-type { font-size: 0.8rem; color: #334155; }
    .reason-cell { max-width: 180px; }
    .user-cell { font-size: 0.8rem; color: #64748b; }
    .ref-badge { font-family: monospace; font-size: 0.8rem; color: #64748b; }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }
    .text-muted { color: #94a3b8; }
    .num-cell { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
    .num-pos { color: #0f766e; }
    .num-neg { color: #b91c1c; }
    .status-pill {
      font-size: 0.725rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
    }
    .status-pill--posted { background: #dcfce7; color: #15803d; }
    .status-pill--reversal { background: #fee2e2; color: #b91c1c; }
    .pagination-container { display: flex; justify-content: flex-end; }
    .empty-wrap { padding: 2rem 0; }
  `]
})
export class ManualAdjustmentsViewComponent {
  readonly dataset = input<ReportDataset | null>(null);
  readonly page = input<number>(1);
  readonly pageSize = input<number>(25);
  readonly total = input<number>(0);
  readonly loading = input<boolean>(false);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  formatDomain(domain: string | undefined): string {
    if (!domain) return 'Account';
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  formatBalanceType(type: string | undefined): string {
    if (!type) return 'Balance Adjustment';
    return BALANCE_TYPE_LABELS[type] ?? type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
    return `${sign}PKR ${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  getDeltaColorClass(val: string | undefined): string {
    if (!val) return '';
    const num = parseFloat(val);
    return num > 0 ? 'num-pos' : num < 0 ? 'num-neg' : '';
  }

  getBeforeAmount(row: any): string | undefined {
    return row?.beforeAmount?.amount;
  }

  getDeltaAmount(row: any): string | undefined {
    return row?.delta?.amount;
  }

  getAfterAmount(row: any): string | undefined {
    return row?.afterAmount?.amount;
  }
}
