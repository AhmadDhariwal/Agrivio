import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import {
  ReportDataset,
  RECONCILIATION_CHECK_NAMES,
  ReconciliationCheckDto,
  ReconciliationFindingDto,
} from '../../models/reports.models';

@Component({
  selector: 'agrivio-reconciliation-view',
  standalone: true,
  imports: [CommonModule, UiPaginationComponent],
  template: `
    <div class="reconciliation-view" data-testid="reconciliation-report-view">
      <!-- Header -->
      <div class="report-head">
        <div class="head-info">
          <h2 class="report-title" data-testid="reconciliation-title">Financial Reconciliation Diagnostics</h2>
          <p class="report-subtitle">
            Integrity verification across ledger balances, double-entry transfer pairings, and advance constraints.
          </p>
        </div>
        <div class="overall-status" data-testid="overall-reconciliation-status">
          <span class="status-label">Overall Status:</span>
          <span class="status-badge" [class]="'badge-' + normalizeStatus(dataset()?.status)">
            {{ dataset()?.status || 'Not Checked / Unavailable' }}
          </span>
        </div>
      </div>

      <!-- Diagnostic Philosophy Banner -->
      <div class="diagnostic-banner" role="note" data-testid="reconciliation-notice">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <div class="banner-body">
          <strong>Diagnostic Mode:</strong>
          This diagnostic view identifies discrepancies against double-entry invariants and domain bounds.
          Reconciliation findings require verified audit investigation and source workflow adjustment. Automatic arbitrary overrides are strictly prohibited.
        </div>
      </div>

      <!-- Summary KPI Grid -->
      <div class="summary-grid" data-testid="reconciliation-summary-grid">
        <div class="summary-card card-reconciled" data-testid="reconciled-count-card">
          <span class="card-label">Checks Reconciled</span>
          <span class="card-value">{{ reconciledCount() }}</span>
          <span class="card-caption">Double-entry constraints verified</span>
        </div>

        <div class="summary-card card-mismatches" data-testid="mismatches-count-card">
          <span class="card-label">Mismatches Detected</span>
          <span class="card-value" [class.val-danger]="mismatchCount() > 0">{{ mismatchCount() }}</span>
          <span class="card-caption">Discrepancies requiring investigation</span>
        </div>

        <div class="summary-card card-not-checked" data-testid="not-checked-count-card">
          <span class="card-label">Not Checked / Unavailable</span>
          <span class="card-value">{{ notCheckedCount() }}</span>
          <span class="card-caption">Audited via owning workflows</span>
        </div>

        <div class="summary-card card-total-findings" data-testid="total-findings-card">
          <span class="card-label">Total Findings</span>
          <span class="card-value">{{ dataset()?.totals?.['findings'] ?? dataset()?.rows?.length ?? 0 }}</span>
          <span class="card-caption">Active anomaly line items</span>
        </div>
      </div>

      <!-- Diagnostic Checks Overview -->
      @if (dataset()?.checks?.length) {
        <div class="section-card" data-testid="reconciliation-checks-section">
          <h3 class="section-heading">Integrity Checks Status</h3>
          <div class="checks-grid">
            @for (chk of dataset()!.checks!; track chk.code) {
              <div class="check-item" [attr.data-testid]="'check-' + chk.code">
                <div class="check-header">
                  <span class="check-title">{{ getHumanCheckName(chk.code) }}</span>
                  <span class="check-badge" [class]="'badge-' + normalizeStatus(chk.status)">
                    {{ chk.status }}
                  </span>
                </div>
                <div class="check-code-detail">{{ chk.code }}</div>
                @if (chk.reason) {
                  <p class="check-reason">{{ chk.reason }}</p>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Findings Table Section -->
      <div class="section-card findings-section" data-testid="reconciliation-findings-section">
        <div class="findings-header">
          <h3 class="section-heading">
            Findings & Discrepancies
            @if (dataset()?.rows?.length) {
              <span class="count-tag">{{ dataset()!.rows.length }}</span>
            }
          </h3>
        </div>

        @if (!dataset()?.rows?.length) {
          <div class="empty-wrap" data-testid="no-findings-banner">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h4 class="empty-title">No Mismatches Detected</h4>
            <p class="empty-text">All active automated consistency checks passed without finding any discrepancies.</p>
          </div>
        } @else {
          <div class="table-wrap">
            <div class="table-scroll">
              <table class="data-table" data-testid="reconciliation-findings-table">
                <thead>
                  <tr>
                    <th scope="col">Domain</th>
                    <th scope="col">Reference / Entity</th>
                    <th scope="col">Check</th>
                    <th scope="col">Expected</th>
                    <th scope="col">Actual</th>
                    <th scope="col" class="text-right">Difference</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Guidance</th>
                  </tr>
                </thead>
                <tbody>
                  @for (finding of dataset()!.rows; track (finding.code + '-' + finding.reference + '-' + $index)) {
                    <tr class="finding-row" [class.severity-error]="finding.severity === 'error'">
                      <td>
                        <span class="domain-tag">{{ formatDomain(finding.domain) }}</span>
                      </td>
                      <td class="ref-cell">
                        <strong>{{ finding.reference || '—' }}</strong>
                      </td>
                      <td>
                        <div class="check-cell-content">
                          <span class="check-main-name">{{ getHumanCheckName(finding.code) }}</span>
                          <span class="check-sub-code">{{ finding.code }}</span>
                        </div>
                      </td>
                      <td class="criteria-cell">{{ finding.expected }}</td>
                      <td class="criteria-cell actual-value">{{ finding.actual }}</td>
                      <td class="text-right num-cell font-bold">
                        {{ finding.difference ?? '—' }}
                      </td>
                      <td>
                        <span class="severity-badge" [class]="'severity-' + (finding.severity || 'warning')">
                          {{ finding.severity || 'Warning' }}
                        </span>
                      </td>
                      <td class="guidance-cell">
                        {{ finding.remediation || finding.guidance || 'Inspect source transactions and verify lineage.' }}
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
    </div>
  `,
  styles: [`
    .reconciliation-view {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .report-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
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

    .overall-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: #ffffff;
      padding: 0.5rem 0.85rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .status-label {
      font-size: 0.8rem;
      color: #64748b;
      font-weight: 600;
    }

    .diagnostic-banner {
      display: flex;
      gap: 0.75rem;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #64748b;
      border-radius: 8px;
      padding: 0.85rem 1.15rem;
      font-size: 0.85rem;
      color: #334155;
      line-height: 1.45;
    }

    .diagnostic-banner svg {
      flex-shrink: 0;
      color: #475569;
      margin-top: 1px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .summary-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.15rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    .card-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .card-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
    }

    .val-danger {
      color: #dc2626 !important;
    }

    .card-caption {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .section-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    .section-heading {
      font-size: 1rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 1rem 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .count-tag {
      background: #fee2e2;
      color: #b91c1c;
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      border-radius: 12px;
      font-weight: 700;
    }

    .checks-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 0.85rem;
    }

    .check-item {
      border: 1px solid #e2e8f0;
      background: #fafafa;
      border-radius: 8px;
      padding: 0.85rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .check-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }

    .check-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: #1e293b;
    }

    .check-code-detail {
      font-size: 0.72rem;
      font-family: monospace;
      color: #94a3b8;
    }

    .check-reason {
      font-size: 0.75rem;
      color: #64748b;
      margin: 0.25rem 0 0 0;
      line-height: 1.35;
      font-style: italic;
    }

    .status-badge, .check-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .badge-reconciled {
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }

    .badge-mismatch_detected, .badge-mismatch {
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }

    .badge-needs_review {
      background: #fffbeb;
      color: #b45309;
      border: 1px solid #fde68a;
    }

    .badge-not_checked, .badge-not_checked___unavailable, .badge-unavailable {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
    }

    .findings-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .table-wrap {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
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
      vertical-align: top;
    }

    .severity-error {
      background: #fff5f5;
    }

    .domain-tag {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 600;
      background: #f1f5f9;
      color: #475569;
      text-transform: capitalize;
    }

    .ref-cell {
      white-space: nowrap;
      font-family: monospace;
      color: #334155;
    }

    .check-cell-content {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .check-main-name {
      font-weight: 600;
      color: #0f172a;
    }

    .check-sub-code {
      font-size: 0.72rem;
      color: #94a3b8;
      font-family: monospace;
    }

    .criteria-cell {
      font-family: monospace;
      font-size: 0.8rem;
      color: #475569;
    }

    .actual-value {
      font-weight: 600;
      color: #dc2626;
    }

    .num-cell {
      font-variant-numeric: tabular-nums;
    }

    .font-bold {
      font-weight: 700;
    }

    .text-right {
      text-align: right;
    }

    .severity-badge {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .severity-error {
      background: #fee2e2;
      color: #991b1b;
    }

    .severity-warning {
      background: #fef3c7;
      color: #92400e;
    }

    .guidance-cell {
      font-size: 0.8rem;
      color: #334155;
      line-height: 1.4;
      max-width: 320px;
    }

    .empty-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      text-align: center;
      gap: 0.5rem;
    }

    .empty-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #166534;
      margin: 0.5rem 0 0 0;
    }

    .empty-text {
      font-size: 0.85rem;
      color: #64748b;
      margin: 0;
    }

    .pagination-footer {
      padding: 0.75rem 1rem;
      border-top: 1px solid #e2e8f0;
      background: #fafafa;
    }
  `],
})
export class ReconciliationViewComponent {
  dataset = input<ReportDataset | null>(null);
  pageChange = output<number>();

  reconciledCount = computed(() => {
    return this.dataset()?.checks?.filter((c) => c.status === 'Reconciled').length ?? 0;
  });

  mismatchCount = computed(() => {
    const checksMismatches = this.dataset()?.checks?.filter((c) => c.status === 'Mismatch Detected').length ?? 0;
    const findingsLength = this.dataset()?.rows?.length ?? 0;
    return Math.max(checksMismatches, findingsLength);
  });

  notCheckedCount = computed(() => {
    return this.dataset()?.checks?.filter((c) => c.status === 'Not Checked' || c.status?.toLowerCase().includes('not checked')).length ?? 0;
  });

  getHumanCheckName(code: string): string {
    if (!code) return 'System Integrity Check';
    // Exact match or prefix match in dictionary
    if (RECONCILIATION_CHECK_NAMES[code]) {
      return RECONCILIATION_CHECK_NAMES[code];
    }
    for (const [key, name] of Object.entries(RECONCILIATION_CHECK_NAMES)) {
      if (code.startsWith(key) || key.startsWith(code)) {
        return name;
      }
    }
    return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  normalizeStatus(status?: string): string {
    if (!status) return 'not_checked';
    return status.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  formatDomain(domain?: string): string {
    if (!domain) return 'General';
    return domain.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
