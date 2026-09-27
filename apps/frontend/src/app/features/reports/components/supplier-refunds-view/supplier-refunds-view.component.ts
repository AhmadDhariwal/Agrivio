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
  templateUrl: './supplier-refunds-view.component.html',
  styleUrl: './supplier-refunds-view.component.scss',
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
