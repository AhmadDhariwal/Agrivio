import {
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiDialogComponent } from '../ui-dialog/ui-dialog.component';
import { PaymentCorrectionTarget } from '../payment-correction-dialog/payment-correction-dialog.component';

@Component({
  selector: 'agrivio-payment-detail-dialog',
  standalone: true,
  imports: [CommonModule, UiDialogComponent],
  template: `
    <agrivio-ui-dialog
      [open]="open()"
      [title]="dialogTitle()"
      description="Inspect posted payment details, allocations, and transaction lineage."
      size="lg"
      (dismiss)="dismissed.emit()"
    >
      @if (payment(); as p) {
        <div class="detail-container" data-testid="payment-detail-dialog-content">
          <!-- Status Banner -->
          <div class="detail-status-bar">
            <div class="detail-status-left">
              <span class="detail-id font-mono">ID: {{ p.id }}</span>
              <span class="party-type-badge">{{ p.partyType === 'customer' ? 'Customer Payment' : 'Supplier Payment' }}</span>
            </div>
            <div class="detail-status-right">
              @if (p.correctionOfId) {
                <span class="badge badge--warning" data-testid="detail-reversal-badge">Reversal Record</span>
              } @else if (p.replacementPaymentId) {
                <span class="badge badge--muted" data-testid="detail-corrected-badge">Superseded (Corrected)</span>
              } @else {
                <span class="badge badge--success" data-testid="detail-posted-badge">Posted (Active)</span>
              }
            </div>
          </div>

          <!-- Key Metrics Grid -->
          <div class="detail-grid">
            <div class="detail-item detail-item--highlight">
              <span class="detail-label">Amount</span>
              <span class="detail-value detail-value--money">{{ p.amount.currency }} {{ formatMoney(p.amount.amount) }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Payment Date</span>
              <span class="detail-value">{{ p.paymentDate }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">{{ p.partyType === 'customer' ? 'Customer' : 'Supplier' }}</span>
              <span class="detail-value font-medium">{{ p.partyName || '—' }}</span>
              @if (p.partyPhone) {
                <span class="detail-sub">{{ p.partyPhone }}</span>
              }
            </div>
            <div class="detail-item">
              <span class="detail-label">Account</span>
              <span class="detail-value font-mono">{{ p.accountId }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Allocation Mode</span>
              <span class="detail-value">{{ formatMode(p.allocationMode) }}</span>
            </div>
            @if (p.appliedTo) {
              <div class="detail-item">
                <span class="detail-label">Applied To</span>
                <span class="detail-value">{{ formatAppliedTo(p.appliedTo) }}</span>
              </div>
            }
            @if (p.reference) {
              <div class="detail-item">
                <span class="detail-label">Reference</span>
                <span class="detail-value">{{ p.reference }}</span>
              </div>
            }
            @if (p.notes) {
              <div class="detail-item detail-item--full">
                <span class="detail-label">Notes</span>
                <span class="detail-value">{{ p.notes }}</span>
              </div>
            }
          </div>

          <!-- Lineage Notices -->
          @if (p.correctionOfId) {
            <div class="lineage-card lineage-card--reversal" data-testid="detail-reversal-notice">
              <div class="lineage-card__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              </div>
              <div class="lineage-card__content">
                <h4 class="lineage-card__title">Immutable Reversal Record</h4>
                <p class="lineage-card__desc">
                  This transaction is an immutable reversal of payment <strong class="font-mono">{{ p.correctionOfId }}</strong>.
                </p>
                @if (p.reason) {
                  <p class="lineage-card__reason"><strong>Audit Reason:</strong> {{ p.reason }}</p>
                }
              </div>
            </div>
          }

          @if (p.replacementPaymentId) {
            <div class="lineage-card lineage-card--replaced" data-testid="detail-replaced-notice">
              <div class="lineage-card__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>
              </div>
              <div class="lineage-card__content">
                <h4 class="lineage-card__title">Payment Superseded by Correction</h4>
                <p class="lineage-card__desc">
                  This payment was reversed and replaced by payment <strong class="font-mono">{{ p.replacementPaymentId }}</strong>.
                </p>
                @if (p.reason) {
                  <p class="lineage-card__reason"><strong>Correction Reason:</strong> {{ p.reason }}</p>
                }
              </div>
            </div>
          }

          <!-- Allocations Breakdown (if any) -->
          @if (p.allocations && p.allocations.length > 0) {
            <section class="allocations-section" aria-label="Payment Allocations">
              <h4 class="allocations-heading">Allocation Breakdown ({{ p.allocations.length }})</h4>
              <div class="allocations-table-wrap">
                <table class="allocations-table">
                  <thead>
                    <tr>
                      <th scope="col">Target Type</th>
                      <th scope="col">Target ID</th>
                      <th scope="col" class="text-right">Allocated Amount</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (alloc of p.allocations; track alloc.id) {
                      <tr>
                        <td>
                          <span class="alloc-target-chip">{{ formatTargetType(alloc.targetType) }}</span>
                        </td>
                        <td class="font-mono">{{ alloc.targetId }}</td>
                        <td class="text-right font-mono font-medium">{{ alloc.allocatedAmount.currency }} {{ formatMoney(alloc.allocatedAmount.amount) }}</td>
                        <td>
                          <span class="alloc-status-dot" [class.alloc-status-dot--active]="alloc.status === 'posted'"></span>
                          {{ alloc.status }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }
        </div>

        <!-- Detail Actions Footer -->
        <div class="detail-actions">
          <button type="button" class="ag-btn ag-btn--secondary" (click)="dismissed.emit()"
            data-testid="payment-detail-close-btn">
            Close
          </button>
          @if (isPaymentCorrectable() && canCorrect()) {
            <button type="button" class="ag-btn ag-btn--danger" (click)="onReverseClicked()"
              data-testid="payment-detail-reverse-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.36"></path></svg>
              Reverse Payment
            </button>
            <button type="button" class="ag-btn ag-btn--primary" (click)="onCorrectClicked()"
              data-testid="payment-detail-correct-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Correct Payment
            </button>
          }
        </div>
      }
    </agrivio-ui-dialog>
  `,
  styles: [`
    .detail-container { display: flex; flex-direction: column; gap: 1rem; }
    .detail-status-bar { display: flex; justify-content: space-between; align-items: center; padding: .625rem .875rem; background: var(--ag-surface-raised, #f8f9fa); border: 1px solid var(--ag-border, #e5e7eb); border-radius: var(--ag-radius, 8px); gap: .75rem; flex-wrap: wrap; }
    .detail-status-left { display: flex; align-items: center; gap: .625rem; }
    .detail-id { font-size: .8125rem; color: var(--ag-text-muted, #6b7280); }
    .party-type-badge { font-size: .6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 4px; }
    .badge { font-size: .75rem; font-weight: 600; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; }
    .badge--success { background: #dcfce7; color: #166534; }
    .badge--warning { background: #fef3c7; color: #92400e; }
    .badge--muted { background: #f1f5f9; color: #475569; }
    .detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: .75rem 1.25rem; background: var(--ag-surface, #fff); border: 1px solid var(--ag-border, #e5e7eb); border-radius: var(--ag-radius, 8px); padding: 1rem; }
    .detail-item { display: flex; flex-direction: column; gap: .125rem; }
    .detail-item--highlight { background: var(--ag-surface-green-faint, #f0fdf4); padding: .5rem .75rem; border-radius: 6px; border: 1px solid #bbf7d0; }
    .detail-item--full { grid-column: 1 / -1; }
    .detail-label { font-size: .6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--ag-text-muted, #6b7280); }
    .detail-value { font-size: .875rem; color: var(--ag-text, #111827); }
    .detail-value--money { font-family: var(--ag-font-mono, monospace); font-size: 1.125rem; font-weight: 700; color: #166534; }
    .detail-sub { font-size: .75rem; color: var(--ag-text-muted, #6b7280); }
    .font-mono { font-family: var(--ag-font-mono, monospace); }
    .font-medium { font-weight: 500; }
    .text-right { text-align: right; }
    .lineage-card { display: flex; gap: .75rem; padding: .875rem 1rem; border-radius: var(--ag-radius, 8px); }
    .lineage-card--reversal { background: #fffbeb; border: 1px solid #fde68a; }
    .lineage-card--replaced { background: #f8fafc; border: 1px solid #cbd5e1; }
    .lineage-card__icon { color: #d97706; flex-shrink: 0; padding-top: 2px; }
    .lineage-card--replaced .lineage-card__icon { color: #64748b; }
    .lineage-card__content { display: flex; flex-direction: column; gap: .25rem; font-size: .8125rem; }
    .lineage-card__title { margin: 0; font-size: .875rem; font-weight: 600; color: #111827; }
    .lineage-card__desc { margin: 0; color: #374151; }
    .lineage-card__reason { margin: .25rem 0 0; color: #1f2937; }
    .allocations-section { display: flex; flex-direction: column; gap: .5rem; }
    .allocations-heading { font-size: .8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--ag-text-muted, #6b7280); margin: 0; }
    .allocations-table-wrap { overflow-x: auto; border: 1px solid var(--ag-border, #e5e7eb); border-radius: var(--ag-radius, 6px); }
    .allocations-table { width: 100%; border-collapse: collapse; font-size: .8125rem; }
    .allocations-table th { background: var(--ag-surface-raised, #f8f9fa); padding: .5rem .75rem; text-align: left; font-weight: 600; color: var(--ag-text-muted, #6b7280); border-bottom: 1px solid var(--ag-border, #e5e7eb); font-size: .6875rem; text-transform: uppercase; letter-spacing: .05em; }
    .allocations-table td { padding: .5rem .75rem; border-bottom: 1px solid var(--ag-border, #f1f5f9); }
    .alloc-target-chip { display: inline-block; padding: 1px 6px; font-size: .6875rem; font-weight: 500; border-radius: 4px; background: #e0f2fe; color: #0369a1; text-transform: capitalize; }
    .alloc-status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; margin-right: 4px; }
    .alloc-status-dot--active { background: #22c55e; }
    .detail-actions { display: flex; justify-content: flex-end; align-items: center; gap: .75rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--ag-border, #e5e7eb); }
    @media (max-width: 640px) {
      .detail-grid { grid-template-columns: 1fr; }
      .detail-actions { flex-direction: column-reverse; }
      .detail-actions .ag-btn { width: 100%; justify-content: center; }
    }
  `],
})
export class PaymentDetailDialogComponent {
  readonly open = input(false);
  readonly payment = input<PaymentCorrectionTarget | null>(null);
  readonly canCorrect = input(false);

  readonly reverseClicked = output<PaymentCorrectionTarget>();
  readonly correctClicked = output<PaymentCorrectionTarget>();
  readonly dismissed = output<void>();

  readonly dialogTitle = computed(() => {
    const p = this.payment();
    if (!p) return 'Payment Details';
    return `${p.partyType === 'customer' ? 'Customer' : 'Supplier'} Payment Details`;
  });

  isPaymentCorrectable(): boolean {
    const p = this.payment();
    if (!p) return false;
    return p.correctionOfId === null && p.replacementPaymentId === null;
  }

  onReverseClicked(): void {
    const p = this.payment();
    if (p) this.reverseClicked.emit(p);
  }

  onCorrectClicked(): void {
    const p = this.payment();
    if (p) this.correctClicked.emit(p);
  }

  formatMoney(amount: string | null | undefined): string {
    const val = parseFloat(amount ?? '0');
    if (isNaN(val)) return '0.00';
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatMode(mode?: string): string {
    if (mode === 'invoice_specific') return 'Invoice-specific';
    return 'General (oldest first)';
  }

  formatAppliedTo(appliedTo?: string | null): string {
    if (!appliedTo) return '—';
    if (appliedTo === 'receivable_and_advance') return 'Receivable & Advance';
    return appliedTo.charAt(0).toUpperCase() + appliedTo.slice(1);
  }

  formatTargetType(targetType: string): string {
    return targetType.replace(/_/g, ' ');
  }
}
