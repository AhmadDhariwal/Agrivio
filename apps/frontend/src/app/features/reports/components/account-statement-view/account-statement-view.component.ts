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
  templateUrl: './account-statement-view.component.html',
  styleUrl: './account-statement-view.component.scss',
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
