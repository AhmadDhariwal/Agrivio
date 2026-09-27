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
  templateUrl: './manual-adjustments-view.component.html',
  styleUrl: './manual-adjustments-view.component.scss',
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
