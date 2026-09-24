import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDateTimePipe } from '../../../../shared/format/date-time.pipe';
import { LiquidPositionDto, CustomerPositionDto, SupplierPositionDto, ReportDataset } from '../../models/reports.models';

@Component({
  selector: 'agrivio-financial-position-view',
  standalone: true,
  imports: [CommonModule, AppDateTimePipe],
  template: `
    <div class="financial-position" data-testid="financial-position-view">
      <!-- Header -->
      <div class="position-head">
        <div class="position-head__info">
          <h2 class="position-title" data-testid="financial-position-title">Financial Position</h2>
          <p class="position-subtitle">
            Current authoritative liquidity, customer balances, and supplier liabilities.
            @if (dataset()?.asOf; as asOf) {
              <span class="as-of-badge" data-testid="position-as-of">As of {{ asOf | agDateTime }}</span>
            }
          </p>
        </div>
      </div>

      <!-- 1. LIQUID POSITION CARDS -->
      <section class="position-section" aria-label="Liquid Position" data-testid="section-liquid-position">
        <div class="section-header">
          <div class="section-indicator section-indicator--liquid" aria-hidden="true"></div>
          <h3 class="section-title">Liquid Position</h3>
          <span class="section-hint">Active cash, bank accounts &amp; digital wallets</span>
        </div>
        <div class="cards-grid cards-grid--4">
          <div class="summary-card" data-testid="card-cash-in-hand">
            <span class="card-label">Cash in Hand</span>
            <strong class="card-value">{{ formatMoney(liquid()?.cashInHand?.amount) }}</strong>
            <span class="card-meta">Active cash accounts</span>
          </div>

          <div class="summary-card" data-testid="card-bank-balances">
            <span class="card-label">Bank Balances</span>
            <strong class="card-value">{{ formatMoney(liquid()?.bankBalances?.amount) }}</strong>
            <span class="card-meta">Active bank accounts</span>
          </div>

          <div class="summary-card" data-testid="card-other-liquid">
            <span class="card-label">Other Liquid</span>
            <strong class="card-value">{{ formatMoney(liquid()?.otherLiquidAccounts?.amount) }}</strong>
            <span class="card-meta">JazzCash &amp; Easypaisa</span>
          </div>

          <div class="summary-card summary-card--primary" data-testid="card-total-liquid">
            <span class="card-label">Total Liquid Funds</span>
            <strong class="card-value card-value--large" data-testid="total-liquid-funds-value">
              {{ formatMoney(liquid()?.totalLiquidFunds?.amount) }}
            </strong>
            <span class="card-meta">Authoritative total liquidity</span>
          </div>
        </div>
      </section>

      <!-- 2. CUSTOMER POSITION CARDS -->
      <section class="position-section" aria-label="Customer Position" data-testid="section-customer-position">
        <div class="section-header">
          <div class="section-indicator section-indicator--customers" aria-hidden="true"></div>
          <h3 class="section-title">Customer Position</h3>
          <span class="section-hint">Trade receivables, customer loans, and advances</span>
        </div>
        <div class="cards-grid cards-grid--5">
          <div class="summary-card" data-testid="card-trade-receivable">
            <span class="card-label">Trade Receivable</span>
            <strong class="card-value">{{ formatMoney(customers()?.tradeReceivable?.amount) }}</strong>
            <span class="card-meta">Outstanding sales balances</span>
          </div>

          <div class="summary-card" data-testid="card-customer-loan">
            <span class="card-label">Customer Loan Receivable</span>
            <strong class="card-value">{{ formatMoney(customers()?.customerLoanReceivable?.amount) }}</strong>
            <span class="card-meta">Disbursed principal outstanding</span>
          </div>

          <div class="summary-card" data-testid="card-customer-advance">
            <span class="card-label">Customer Advance</span>
            <strong class="card-value">{{ formatMoney(customers()?.customerAdvance?.amount) }}</strong>
            <span class="card-meta">Available customer deposits</span>
          </div>

          <div class="summary-card" data-testid="card-net-trade-exposure">
            <span class="card-label">Net Exposure</span>
            <strong class="card-value">{{ formatMoney(customers()?.netTradeExposure?.amount) }}</strong>
            <span class="card-meta">Trade receivable less advance</span>
          </div>

          <div class="summary-card summary-card--primary" data-testid="card-total-customer-exposure">
            <span class="card-label">Total Customer Exposure</span>
            <strong class="card-value card-value--large" data-testid="total-customer-exposure-value">
              {{ formatMoney(customers()?.totalCustomerExposure?.amount) }}
            </strong>
            <span class="card-meta">Trade + Loans less advance</span>
          </div>
        </div>
      </section>

      <!-- 3. SUPPLIER POSITION CARDS -->
      <section class="position-section" aria-label="Supplier Position" data-testid="section-supplier-position">
        <div class="section-header">
          <div class="section-indicator section-indicator--suppliers" aria-hidden="true"></div>
          <h3 class="section-title">Supplier Position</h3>
          <span class="section-hint">Payables and prepaid advances</span>
        </div>
        <div class="cards-grid cards-grid--3">
          <div class="summary-card" data-testid="card-supplier-payable">
            <span class="card-label">Supplier Payable</span>
            <strong class="card-value">{{ formatMoney(suppliers()?.supplierPayable?.amount) }}</strong>
            <span class="card-meta">Total supplier invoices due</span>
          </div>

          <div class="summary-card" data-testid="card-supplier-advance">
            <span class="card-label">Supplier Advance</span>
            <strong class="card-value">{{ formatMoney(suppliers()?.supplierAdvance?.amount) }}</strong>
            <span class="card-meta">Advance payments held with suppliers</span>
          </div>

          <div class="summary-card summary-card--primary" data-testid="card-net-supplier-payable">
            <span class="card-label">Net Supplier Payable</span>
            <strong class="card-value card-value--large" data-testid="net-supplier-payable-value">
              {{ formatMoney(suppliers()?.netSupplierPayable?.amount) }}
            </strong>
            <span class="card-meta">Payable less advance</span>
          </div>
        </div>
      </section>

      <!-- 4. Position Breakdown Table -->
      @if (dataset()?.rows?.length) {
        <section class="breakdown-table-wrap" aria-label="Position Metrics Breakdown">
          <h3 class="breakdown-title">Position Summary Table</h3>
          <div class="table-scroll">
            <table class="data-table" data-testid="financial-position-table">
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col">Metric</th>
                  <th scope="col" class="text-right">Amount (PKR)</th>
                </tr>
              </thead>
              <tbody>
                @for (row of dataset()!.rows; track $index) {
                  <tr>
                    <td><strong>{{ row['section'] }}</strong></td>
                    <td>{{ row['metric'] }}</td>
                    <td class="text-right num-cell">PKR {{ formatMoney(getAmount(row)) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .financial-position {
      display: flex;
      flex-direction: column;
      gap: 1.75rem;
    }
    .position-head {
      border-bottom: 1px solid var(--ag-border, #e2e8f0);
      padding-bottom: 1rem;
    }
    .position-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--ag-text-primary, #0f172a);
      margin: 0;
    }
    .position-subtitle {
      font-size: 0.875rem;
      color: var(--ag-text-muted, #64748b);
      margin: 0.25rem 0 0 0;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .as-of-badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      background: var(--ag-bg-subtle, #f1f5f9);
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--ag-text-secondary, #334155);
    }
    .position-section {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .section-indicator {
      width: 4px;
      height: 18px;
      border-radius: 2px;
    }
    .section-indicator--liquid { background: #0284c7; }
    .section-indicator--customers { background: #7c3aed; }
    .section-indicator--suppliers { background: #d97706; }
    .section-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--ag-text-primary, #0f172a);
      margin: 0;
    }
    .section-hint {
      font-size: 0.8rem;
      color: var(--ag-text-muted, #94a3b8);
      margin-left: 0.5rem;
    }
    .cards-grid {
      display: grid;
      gap: 1rem;
    }
    .cards-grid--3 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .cards-grid--4 { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
    .cards-grid--5 { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
    .summary-card {
      background: var(--ag-surface, #ffffff);
      border: 1px solid var(--ag-border, #e2e8f0);
      border-radius: 8px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .summary-card--primary {
      background: var(--ag-bg-subtle, #f8fafc);
      border-color: #cbd5e1;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .card-label {
      font-size: 0.775rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ag-text-muted, #64748b);
    }
    .card-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--ag-text-primary, #0f172a);
      font-variant-numeric: tabular-nums;
    }
    .card-value--large {
      font-size: 1.35rem;
      color: var(--ag-brand-primary, #0284c7);
    }
    .card-meta {
      font-size: 0.725rem;
      color: var(--ag-text-muted, #94a3b8);
    }
    .breakdown-table-wrap {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .breakdown-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--ag-text-primary, #0f172a);
      margin: 0;
    }
    .table-scroll {
      overflow-x: auto;
      border: 1px solid var(--ag-border, #e2e8f0);
      border-radius: 8px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      background: var(--ag-surface, #ffffff);
    }
    .data-table th, .data-table td {
      padding: 0.65rem 1rem;
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
    .text-right { text-align: right !important; }
    .num-cell { font-variant-numeric: tabular-nums; font-weight: 600; }
  `]
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
