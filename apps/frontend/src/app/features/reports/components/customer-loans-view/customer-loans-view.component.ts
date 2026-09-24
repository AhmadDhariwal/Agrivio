import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDatePipe } from '../../../../shared/format/date-time.pipe';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { ReportDataset } from '../../models/reports.models';

@Component({
  selector: 'agrivio-customer-loans-view',
  standalone: true,
  imports: [CommonModule, AppDatePipe, UiPaginationComponent, UiEmptyStateComponent],
  template: `
    <div class="loans-report" data-testid="customer-loans-report-view">
      <!-- Header -->
      <div class="report-head">
        <h2 class="report-title" data-testid="customer-loans-title">Customer Loans</h2>
        <p class="report-subtitle">
          Customer financing ledger, repayment tracking, and outstanding balances.
        </p>
      </div>

      <!-- Loans Table -->
      @if (!dataset()?.rows?.length) {
        <div class="empty-wrap">
          <agrivio-ui-empty-state
            title="No customer loans found"
            message="No customer loans match the selected filter criteria."
          />
        </div>
      } @else {
        <div class="table-wrap">
          <div class="table-scroll">
            <table class="data-table" data-testid="customer-loans-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Loan Date</th>
                  <th scope="col">Reference</th>
                  <th scope="col" class="text-right">Principal</th>
                  <th scope="col" class="text-right">Repaid</th>
                  <th scope="col" class="text-right">Outstanding</th>
                  <th scope="col">Due Date</th>
                  <th scope="col">Status</th>
                  <th scope="col">Disbursement Account</th>
                </tr>
              </thead>
              <tbody>
                @for (row of dataset()!.rows; track (row.id ?? $index)) {
                  <tr class="loan-row" [attr.data-testid]="'loan-row-' + (row.id ?? $index)">
                    <td>
                      <strong class="customer-name">{{ getCustomerName(row) }}</strong>
                    </td>
                    <td class="date-cell">{{ (row.businessDate || row.loanDate) | agDate }}</td>
                    <td class="ref-cell">{{ row.reference || row.loanNumber || '—' }}</td>
                    <td class="text-right num-cell">
                      PKR {{ formatMoney(getPrincipalAmount(row)) }}
                    </td>
                    <td class="text-right num-cell text-muted">
                      PKR {{ formatMoney(getRepaidAmount(row)) }}
                    </td>
                    <td class="text-right num-cell font-bold" [class.text-danger]="isOverdue(row)">
                      PKR {{ formatMoney(getOutstandingAmount(row)) }}
                    </td>
                    <td class="date-cell">
                      @if (row.dueDate) {
                        <span [class.overdue-label]="isOverdue(row)">
                          {{ row.dueDate | agDate }}
                        </span>
                      } @else {
                        <span class="text-muted">—</span>
                      }
                    </td>
                    <td>
                      <span class="status-badge" [class]="'badge-' + normalizeStatus(row.status)">
                        {{ formatStatus(row.status) }}
                      </span>
                    </td>
                    <td class="account-cell">
                      {{ getAccountName(row) }}
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
    .loans-report {
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

    .customer-name {
      color: #0f172a;
      font-weight: 600;
    }

    .num-cell {
      font-variant-numeric: tabular-nums;
      font-weight: 500;
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

    .text-danger {
      color: #dc2626;
    }

    .date-cell, .ref-cell {
      color: #475569;
      white-space: nowrap;
    }

    .account-cell {
      color: #334155;
    }

    .overdue-label {
      color: #dc2626;
      font-weight: 600;
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

    .badge-open {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }

    .badge-fully_repaid, .badge-repaid {
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }

    .badge-defaulted {
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }

    .badge-cancelled {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
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
export class CustomerLoansViewComponent {
  dataset = input<ReportDataset | null>(null);
  pageChange = output<number>();

  getCustomerName(row: any): string {
    return row.customerName || row.customer?.name || (row.customerId ? `Customer (${row.customerId})` : '—');
  }

  getAccountName(row: any): string {
    return row.accountName || row.disbursementAccount?.name || row.disbursementAccountId || '—';
  }

  normalizeStatus(status?: string): string {
    return (status || 'open').toLowerCase().replace(/\s+/g, '_');
  }

  formatStatus(status?: string): string {
    if (!status) return 'Open';
    return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  isOverdue(row: any): boolean {
    if (!row.dueDate || row.status === 'fully_repaid' || row.status === 'cancelled') return false;
    const outstanding = parseFloat(row.outstanding?.amount ?? row.outstandingAmount?.amount ?? '0');
    if (outstanding <= 0) return false;
    const today = new Date().toISOString().slice(0, 10);
    return row.dueDate < today;
  }

  formatMoney(value: any): string {
    if (value === null || value === undefined || value === '') return '0.00';
    const num = Number(value);
    return isNaN(num) ? String(value) : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  getPrincipalAmount(row: any): string | undefined {
    return row?.principal?.amount ?? row?.principalAmount?.amount;
  }

  getRepaidAmount(row: any): string | undefined {
    return row?.repaid?.amount ?? row?.repaidAmount?.amount;
  }

  getOutstandingAmount(row: any): string | undefined {
    return row?.outstanding?.amount ?? row?.outstandingAmount?.amount;
  }
}
