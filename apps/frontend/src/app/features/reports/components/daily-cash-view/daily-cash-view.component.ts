import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppDatePipe } from '../../../../shared/format/date-time.pipe';
import { ReportDataset } from '../../models/reports.models';

@Component({
  selector: 'agrivio-daily-cash-view',
  standalone: true,
  imports: [CommonModule, AppDatePipe],
  template: `
    <div class="daily-cash" data-testid="daily-cash-position-view">
      <!-- Header -->
      <div class="daily-cash__head">
        <h2 class="daily-cash__title">
          Daily Cash Position
          @if (dataset()?.businessDate; as bDate) {
            <span class="date-badge" data-testid="daily-cash-date">{{ bDate | agDate }}</span>
          }
        </h2>
        <p class="daily-cash__subtitle">
          Liquid fund balance movements, external flows, internal transfers, and daily treasury equation.
        </p>
      </div>

      <!-- Transfer Semantics Banner -->
      <div class="transfer-notice-banner" role="note" data-testid="transfer-notice">
        <div class="banner-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <p class="banner-text">
          Internal transfers move money between Agrivio accounts and do not change Total Liquid Funds.
        </p>
      </div>

      <!-- Daily Flow Cards (Equation Summary) -->
      <section class="flow-equation" aria-label="Daily Liquid Flow Summary" data-testid="section-daily-flows">
        <div class="flow-card" data-testid="card-opening-liquid">
          <span class="flow-card__step">Start of Day</span>
          <span class="flow-card__label">Opening Liquid Funds</span>
          <strong class="flow-card__value" data-testid="opening-liquid-funds-value">
            PKR {{ formatMoney(dataset()?.openingLiquidFunds?.amount) }}
          </strong>
        </div>

        <div class="flow-operator" aria-hidden="true">+</div>

        <div class="flow-card flow-card--inflow" data-testid="card-inflows">
          <span class="flow-card__step">Inflow (+)</span>
          <span class="flow-card__label">External Inflows</span>
          <strong class="flow-card__value">
            PKR {{ formatMoney(totalInflows()) }}
          </strong>
          <span class="flow-card__meta">
            Business: {{ formatMoney(dataset()?.businessExternalInflows?.amount) }} |
            Manual: {{ formatMoney(dataset()?.manualExternalInflows?.amount) }}
          </span>
        </div>

        <div class="flow-operator" aria-hidden="true">−</div>

        <div class="flow-card flow-card--outflow" data-testid="card-outflows">
          <span class="flow-card__step">Outflow (−)</span>
          <span class="flow-card__label">External Outflows</span>
          <strong class="flow-card__value">
            PKR {{ formatMoney(totalOutflows()) }}
          </strong>
          <span class="flow-card__meta">
            Business: {{ formatMoney(dataset()?.businessExternalOutflows?.amount) }} |
            Manual: {{ formatMoney(dataset()?.manualExternalOutflows?.amount) }}
          </span>
        </div>

        <div class="flow-operator" aria-hidden="true">±</div>

        <div class="flow-card" data-testid="card-adjustments">
          <span class="flow-card__step">Correction (±)</span>
          <span class="flow-card__label">Balance Adjustments</span>
          <strong class="flow-card__value" data-testid="balance-adjustments-value">
            PKR {{ formatSignedMoney(dataset()?.accountBalanceAdjustments?.amount) }}
          </strong>
          <span class="flow-card__meta">Account level adjustments</span>
        </div>

        <div class="flow-operator" aria-hidden="true">=</div>

        <div class="flow-card flow-card--closing" data-testid="card-closing-liquid">
          <span class="flow-card__step">End of Day</span>
          <span class="flow-card__label">Closing Liquid Funds</span>
          <strong class="flow-card__value flow-card__value--large" data-testid="closing-liquid-funds-value">
            PKR {{ formatMoney(dataset()?.closingLiquidFunds?.amount) }}
          </strong>
        </div>
      </section>

      <!-- Internal Transfers & Daily Reconciliation Info Row -->
      <div class="flow-secondary-row">
        <!-- Internal Transfers Card -->
        <div class="summary-box" data-testid="card-internal-transfers">
          <div class="summary-box__head">
            <h3 class="summary-box__title">Internal Account Transfers</h3>
            <span class="tag-neutral">Net impact: PKR {{ formatMoney(dataset()?.internalTransferNet?.amount) }}</span>
          </div>
          <div class="summary-box__body">
            <div class="summary-stat">
              <span class="stat-label">Transfer Volume (one-way)</span>
              <strong class="stat-value" data-testid="internal-transfers-volume">
                PKR {{ formatMoney(dataset()?.internalTransfers?.amount) }}
              </strong>
            </div>
            <p class="summary-desc">
              Transfers between internal cash and bank accounts shift balances without altering total company funds.
            </p>
          </div>
        </div>

        <!-- Daily Reconciliation Card -->
        <div class="summary-box" data-testid="card-daily-reconciliation">
          <div class="summary-box__head">
            <h3 class="summary-box__title">Daily Reconciliation</h3>
            <span
              class="status-pill"
              [ngClass]="'status-pill--' + (dataset()?.reconciliation?.status === 'Reconciled' ? 'success' : 'danger')"
              data-testid="reconciliation-status-badge"
            >
              {{ dataset()?.reconciliation?.status ?? 'Not Checked' }}
            </span>
          </div>
          <div class="summary-box__body">
            <div class="recon-stats">
              <div class="summary-stat">
                <span class="stat-label">Expected Closing</span>
                <span class="stat-val">PKR {{ formatMoney(dataset()?.reconciliation?.expectedClosing?.amount) }}</span>
              </div>
              <div class="summary-stat">
                <span class="stat-label">Difference</span>
                <span class="stat-val" [class.text-danger]="dataset()?.reconciliation?.difference?.amount !== '0.00'">
                  PKR {{ formatMoney(dataset()?.reconciliation?.difference?.amount) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Unclassified Treasury Section -->
      @if (dataset()?.unclassifiedTreasury; as unclass) {
        <section class="unclassified-section" aria-label="Unclassified Treasury Activity" data-testid="section-unclassified-treasury">
          <div class="unclassified-card" data-testid="unclassified-treasury-card">
            <div class="unclassified-card__header">
              <div class="unclass-badge">Period Metric</div>
              <h3 class="unclass-title">Unclassified Treasury Activity</h3>
            </div>
            <p class="unclass-helper" data-testid="unclassified-helper-text">
              Unclassified treasury activity represents manual money movements whose business source was not categorized. It is not automatically treated as revenue or expense.
            </p>
            <div class="unclass-grid">
              <div class="unclass-item" data-testid="unclassified-inflow">
                <span class="unclass-label">Unclassified Inflows</span>
                <strong class="unclass-value">+ PKR {{ formatMoney(unclass.inflow.amount) }}</strong>
              </div>
              <div class="unclass-item" data-testid="unclassified-outflow">
                <span class="unclass-label">Unclassified Outflows</span>
                <strong class="unclass-value">− PKR {{ formatMoney(unclass.outflow.amount) }}</strong>
              </div>
              <div class="unclass-item unclass-item--net" data-testid="unclassified-net">
                <span class="unclass-label">Net Unclassified Treasury Movement</span>
                <strong class="unclass-value">PKR {{ formatSignedMoney(unclass.net.amount) }}</strong>
              </div>
            </div>
          </div>
        </section>
      }

      <!-- Category Breakdown Table -->
      @if (dataset()?.rows?.length) {
        <section class="breakdown-wrap" aria-label="Movement Category Breakdown">
          <h3 class="breakdown-heading">Category Breakdown</h3>
          <div class="table-scroll">
            <table class="data-table" data-testid="daily-cash-breakdown-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" class="text-right">Signed Amount (PKR)</th>
                </tr>
              </thead>
              <tbody>
                @for (row of dataset()!.rows; track $index) {
                  <tr>
                    <td><strong>{{ row['category'] || row['sourceLabel'] || '—' }}</strong></td>
                    <td class="text-right num-cell">
                      <span [ngClass]="getAmountColorClass(getSignedAmount(row))">
                        {{ formatSignedMoney(getSignedAmount(row)) }}
                      </span>
                    </td>
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
    .daily-cash {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .daily-cash__head {
      border-bottom: 1px solid var(--ag-border, #e2e8f0);
      padding-bottom: 0.75rem;
    }
    .daily-cash__title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--ag-text-primary, #0f172a);
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .date-badge {
      font-size: 0.85rem;
      font-weight: 500;
      padding: 0.15rem 0.6rem;
      border-radius: 9999px;
      background: #e0f2fe;
      color: #0369a1;
    }
    .daily-cash__subtitle {
      font-size: 0.875rem;
      color: var(--ag-text-muted, #64748b);
      margin: 0.25rem 0 0 0;
    }
    .transfer-notice-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #0284c7;
      border-radius: 6px;
      padding: 0.75rem 1rem;
    }
    .banner-icon {
      color: #0284c7;
      flex-shrink: 0;
    }
    .banner-text {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 500;
      color: #1e293b;
    }
    .flow-equation {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .flow-card {
      flex: 1;
      min-width: 170px;
      background: var(--ag-surface, #ffffff);
      border: 1px solid var(--ag-border, #e2e8f0);
      border-radius: 8px;
      padding: 0.9rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .flow-card--closing {
      background: #f0fdf4;
      border-color: #86efac;
    }
    .flow-card__step {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }
    .flow-card__label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #475569;
    }
    .flow-card__value {
      font-size: 1.15rem;
      font-weight: 700;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }
    .flow-card__value--large {
      font-size: 1.3rem;
      color: #15803d;
    }
    .flow-card__meta {
      font-size: 0.725rem;
      color: #64748b;
      margin-top: 0.2rem;
    }
    .flow-operator {
      font-size: 1.25rem;
      font-weight: 700;
      color: #94a3b8;
      user-select: none;
    }
    .flow-secondary-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
    }
    .summary-box {
      background: var(--ag-surface, #ffffff);
      border: 1px solid var(--ag-border, #e2e8f0);
      border-radius: 8px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .summary-box__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .summary-box__title {
      font-size: 0.95rem;
      font-weight: 600;
      color: #0f172a;
      margin: 0;
    }
    .tag-neutral {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: #f1f5f9;
      color: #475569;
    }
    .summary-stat {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .stat-label {
      font-size: 0.75rem;
      color: #64748b;
    }
    .stat-value {
      font-size: 1.15rem;
      font-weight: 700;
      color: #0f172a;
    }
    .stat-val {
      font-weight: 600;
      font-size: 0.95rem;
    }
    .summary-desc {
      font-size: 0.8rem;
      color: #64748b;
      margin: 0.25rem 0 0 0;
    }
    .recon-stats {
      display: flex;
      gap: 1.5rem;
    }
    .status-pill {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
    }
    .status-pill--success { background: #dcfce7; color: #15803d; }
    .status-pill--danger { background: #fee2e2; color: #b91c1c; }
    .unclassified-card {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-radius: 8px;
      padding: 1rem;
    }
    .unclassified-card__header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
    }
    .unclass-badge {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      padding: 0.1rem 0.4rem;
      background: #fde68a;
      color: #92400e;
      border-radius: 4px;
    }
    .unclass-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: #92400e;
      margin: 0;
    }
    .unclass-helper {
      font-size: 0.8rem;
      color: #78350f;
      margin: 0 0 0.85rem 0;
      line-height: 1.4;
    }
    .unclass-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
    }
    .unclass-item {
      background: #ffffff;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 0.7rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .unclass-item--net {
      border-color: #f59e0b;
      background: #fffdf5;
    }
    .unclass-label {
      font-size: 0.75rem;
      font-weight: 500;
      color: #64748b;
    }
    .unclass-value {
      font-size: 1rem;
      font-weight: 700;
      color: #0f172a;
    }
    .breakdown-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .breakdown-heading {
      font-size: 0.95rem;
      font-weight: 600;
      color: #0f172a;
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
    .text-danger { color: #b91c1c !important; }
    .num-positive { color: #0f766e; }
    .num-negative { color: #b91c1c; }
    .num-neutral { color: #475569; }
  `]
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
