import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDateTimePipe } from '../../../../shared/format/date-time.pipe';
import { LiquidPositionDto, CustomerPositionDto, SupplierPositionDto, ReportDataset } from '../../models/reports.models';

@Component({
  selector: 'agrivio-financial-position-view',
  standalone: true,
  imports: [CommonModule, AppDateTimePipe],
  templateUrl: './financial-position-view.component.html',
  styleUrl: './financial-position-view.component.scss',
})
export class FinancialPositionViewComponent {
  readonly dataset = input<ReportDataset | null>(null);

  get liquid(): () => LiquidPositionDto | undefined {
    return () => this.dataset()?.liquidPosition;
  }

  get customers(): () => CustomerPositionDto | undefined {
    return () => this.dataset()?.customerPosition;
  }

  get suppliers(): () => SupplierPositionDto | undefined {
    return () => this.dataset()?.supplierPosition;
  }

  formatMoney(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '0.00';
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(num)) return String(value);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  getAmount(row: any): string | number | null | undefined {
    return row?.amount?.amount ?? row?.amount;
  }
}
