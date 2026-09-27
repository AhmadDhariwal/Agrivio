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
  templateUrl: './customer-loans-view.component.html',
  styleUrl: './customer-loans-view.component.scss',
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
