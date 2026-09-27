import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDatePipe } from '../../../../shared/format/date-time.pipe';
import { ReportDataset } from '../../models/reports.models';

@Component({
  selector: 'agrivio-daily-cash-view',
  standalone: true,
  imports: [CommonModule, AppDatePipe],
  templateUrl: './daily-cash-view.component.html',
  styleUrl: './daily-cash-view.component.scss',
})
export class DailyCashViewComponent {
  readonly dataset = input<ReportDataset | null>(null);

  totalInflows(): string {
    const d = this.dataset();
    if (!d) return '0.00';
    const biz = parseFloat(d.businessExternalInflows?.amount ?? '0');
    const man = parseFloat(d.manualExternalInflows?.amount ?? '0');
    return (biz + man).toFixed(2);
  }

  totalOutflows(): string {
    const d = this.dataset();
    if (!d) return '0.00';
    const biz = parseFloat(d.businessExternalOutflows?.amount ?? '0');
    const man = parseFloat(d.manualExternalOutflows?.amount ?? '0');
    return (biz + man).toFixed(2);
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

  getAmountColorClass(val: string | undefined): string {
    if (!val) return 'num-neutral';
    const num = parseFloat(val);
    if (num > 0) return 'num-positive';
    if (num < 0) return 'num-negative';
    return 'num-neutral';
  }

  getSignedAmount(row: any): string | undefined {
    return row?.signedAmount?.amount ?? (typeof row?.signedAmount === 'string' ? row.signedAmount : undefined);
  }
}
