import {
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiDialogComponent } from '../ui-dialog/ui-dialog.component';
import { UiAlertComponent } from '../ui-alert/ui-alert.component';
import { UiFieldLabelComponent } from '../ui-field-label/ui-field-label.component';
import {
  DropdownOption,
  UiSearchableDropdownComponent,
} from '../ui-searchable-dropdown/ui-searchable-dropdown.component';

export interface PaymentCorrectionAllocationTarget {
  id: string;
  label: string;
  outstandingAmount: string;
}

export interface PaymentCorrectionTarget {
  id: string;
  partyType: 'customer' | 'supplier';
  partyName?: string | null;
  partyPhone?: string | null;
  amount: { amount: string; currency: string };
  accountId: string;
  paymentDate: string;
  allocationMode: string;
  appliedTo?: string | null;
  notes: string;
  reference?: string | null;
  correctionOfId?: string | null;
  reason?: string | null;
  replacementPaymentId?: string | null;
  reversalPaymentId?: string | null;
  correctionStatus?: 'reversed' | 'corrected' | null;
  allocations?: {
    id: string;
    targetType: string;
    targetId: string;
    allocatedAmount: { amount: string; currency: string };
    status: string;
  }[];
}

export interface PaymentCorrectionDialogResult {
  paymentId: string;
  mode: 'reverse' | 'correct';
  reason: string;
  replacement: {
    accountId: string;
    amount: { amount: string; currency: string };
    paymentDate: string;
    allocationMode: 'general' | 'invoice_specific';
    allocations?: { targetId: string; amount: { amount: string; currency: string } }[];
    notes: string;
  } | null;
  idempotencyKey: string;
}

@Component({
  selector: 'agrivio-payment-correction-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiDialogComponent,
    UiAlertComponent,
    UiFieldLabelComponent,
    UiSearchableDropdownComponent,
  ],
  template: `
    <agrivio-ui-dialog
      [open]="open()"
      [title]="dialogTitle()"
      description="Posted payments are immutable. Correction creates an atomic reversal and posts a replacement."
      size="lg"
      (dismiss)="onDismiss()"
    >
      @if (payment(); as p) {
        <!-- Original Payment (Read-Only) -->
        <section class="correction-section correction-section--original" aria-label="Original payment details">
          <h3 class="correction-section__heading">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            Original Payment (Immutable Record)
          </h3>
          <div class="correction-readonly-grid">
            <div class="correction-readonly-item">
              <span class="correction-readonly-label">Amount</span>
              <span class="correction-readonly-value correction-readonly-value--money">{{ p.amount.currency }} {{ formatMoney(p.amount.amount) }}</span>
            </div>
            <div class="correction-readonly-item">
              <span class="correction-readonly-label">Payment Date</span>
              <span class="correction-readonly-value">{{ p.paymentDate }}</span>
            </div>
            <div class="correction-readonly-item">
              <span class="correction-readonly-label">{{ p.partyType === 'customer' ? 'Customer' : 'Supplier' }}</span>
              <span class="correction-readonly-value">{{ p.partyName || '—' }}</span>
            </div>
            <div class="correction-readonly-item">
              <span class="correction-readonly-label">Account</span>
              <span class="correction-readonly-value font-mono">{{ p.accountId }}</span>
            </div>
            <div class="correction-readonly-item">
              <span class="correction-readonly-label">Allocation Mode</span>
              <span class="correction-readonly-value">{{ formatMode(p.allocationMode) }}</span>
            </div>
            @if (p.notes) {
              <div class="correction-readonly-item correction-readonly-item--full">
                <span class="correction-readonly-label">Notes</span>
                <span class="correction-readonly-value">{{ p.notes }}</span>
              </div>
            }
          </div>
        </section>

        <!-- Mode Toggle Tabs (Reverse vs Correct) -->
        <div class="correction-mode-tabs" role="group" aria-label="Correction type">
          <button
            type="button"
            class="correction-tab-btn"
            [class.correction-tab-btn--active]="mode() === 'reverse'"
            [attr.aria-pressed]="mode() === 'reverse'"
            (click)="setMode('reverse')"
            data-testid="correction-tab-reverse"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.36"></path></svg>
            Pure Reversal
          </button>
          <button
            type="button"
            class="correction-tab-btn"
            [class.correction-tab-btn--active]="mode() === 'correct'"
            [attr.aria-pressed]="mode() === 'correct'"
            (click)="setMode('correct')"
            data-testid="correction-tab-correct"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Reverse & Replace (Correction)
          </button>
        </div>

        <!-- Corrected Replacement Inputs (shown only in 'correct' mode) -->
        @if (mode() === 'correct') {
          <section class="correction-section correction-section--replacement" aria-label="Replacement payment parameters">
            <h3 class="correction-section__heading">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>
              Replacement Payment Parameters
            </h3>

            <div class="correction-form-grid">
              <!-- Corrected Amount -->
              <div class="form-field">
                <agrivio-ui-field-label for="correction-amount" label="Corrected Amount (PKR)" [required]="true" />
                <input
                  id="correction-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  class="ag-input"
                  [class.ag-input--error]="submitAttempted() && !isAmountValid()"
                  [ngModel]="replacementAmount()"
                  (ngModelChange)="replacementAmount.set($event)"
                  placeholder="0.00"
                  required
                  data-testid="correction-replacement-amount"
                />
                @if (submitAttempted() && !isAmountValid()) {
                  <span class="field-error">Amount must be greater than zero.</span>
                }
              </div>

              <!-- Corrected Business Date -->
              <div class="form-field">
                <agrivio-ui-field-label for="correction-date" label="Payment Business Date" [required]="true" />
                <input
                  id="correction-date"
                  type="date"
                  class="ag-input"
                  [class.ag-input--error]="submitAttempted() && !replacementDate().trim()"
                  [ngModel]="replacementDate()"
                  (ngModelChange)="replacementDate.set($event)"
                  required
                  data-testid="correction-replacement-date"
                />
                @if (submitAttempted() && !replacementDate().trim()) {
                  <span class="field-error">Payment date is required.</span>
                }
              </div>

              <!-- Cash/Bank Account Override (Optional, defaults to original) -->
              <div class="form-field">
                <agrivio-ui-field-label for="correction-account" label="Cash/Bank Account" [required]="true" />
                <agrivio-ui-searchable-dropdown
                  id="correction-account"
                  [options]="accountOptions()"
                  [ngModel]="replacementAccountId()"
                  (ngModelChange)="replacementAccountId.set($event)"
                  [selectedLabel]="selectedAccountLabel()"
                  placeholder="Select active liquid account"
                  ariaLabel="Cash or bank account"
                  testId="correction-replacement-account"
                />
              </div>

              <!-- Allocation Mode -->
              <div class="form-field">
                <agrivio-ui-field-label for="correction-alloc-mode" label="Allocation Mode" [required]="true" />
                <select
                  id="correction-alloc-mode"
                  class="ag-select"
                  [ngModel]="replacementAllocationMode()"
                  (ngModelChange)="replacementAllocationMode.set($event)"
                  data-testid="correction-replacement-allocation-mode"
                >
                  <option value="general">General (Oldest Outstanding First)</option>
                  <option value="invoice_specific">Invoice-Specific</option>
                </select>
              </div>

              <!-- Replacement Notes -->
              <div class="form-field form-field--full">
                <agrivio-ui-field-label for="correction-notes" label="Replacement Payment Notes" />
                <input
                  id="correction-notes"
                  type="text"
                  class="ag-input"
                  [ngModel]="replacementNotes()"
                  (ngModelChange)="replacementNotes.set($event)"
                  placeholder="Replacement notes for the ledger…"
                  data-testid="correction-replacement-notes"
                />
              </div>
            </div>

            @if (replacementAllocationMode() === 'invoice_specific') {
              <div class="allocation-targets" data-testid="correction-allocation-targets">
                <h4>Target allocations</h4>
                @if (allocationTargets().length === 0) {
                  <p class="field-error">No valid outstanding targets are available.</p>
                }
                @for (target of allocationTargets(); track target.id) {
                  <div class="allocation-row">
                    <div>
                      <strong>{{ target.label }}</strong>
                      <span>Outstanding: PKR {{ formatMoney(target.outstandingAmount) }}</span>
                    </div>
                    <label [for]="'correction-allocation-' + $index" class="ag-sr-only">
                      Allocation for {{ target.label }}
                    </label>
                    <input
                      [id]="'correction-allocation-' + $index"
                      type="number"
                      min="0"
                      step="0.01"
                      class="ag-input allocation-row__amount"
                      [ngModel]="allocationAmount(target.id)"
                      (ngModelChange)="setAllocationAmount(target.id, $event)"
                      [attr.data-testid]="'correction-allocation-' + target.id"
                    />
                  </div>
                }
                <div class="allocation-total">
                  Allocated: PKR {{ formatMoney(allocationTotal()) }} / PKR {{ formatMoney(replacementAmount()) }}
                </div>
                @if (submitAttempted() && !isAllocationValid()) {
                  <span class="field-error">Target allocations must equal the replacement amount and must not exceed target outstanding balances.</span>
                }
              </div>
            }
          </section>
        }

        <!-- Required Correction Reason -->
        <section class="correction-section correction-section--reason" aria-label="Reason for correction">
          <agrivio-ui-field-label
            for="correction-reason"
            [label]="mode() === 'reverse' ? 'Reason for Reversal' : 'Reason for Correction'"
            [required]="true"
          />
          <textarea
            id="correction-reason"
            rows="3"
            class="ag-textarea"
            [class.ag-textarea--error]="submitAttempted() && !reason().trim()"
            [ngModel]="reason()"
            (ngModelChange)="reason.set($event)"
            maxlength="500"
            [placeholder]="mode() === 'reverse' ? 'Explain why this payment is being cancelled/reversed (audit trail)…' : 'Explain what was incorrect and why the replacement is needed…'"
            data-testid="correction-reason-input"
          ></textarea>
          <div class="char-count" [class.char-count--warn]="reason().length > 450">
            {{ reason().length }}/500
          </div>
          @if (submitAttempted() && !reason().trim()) {
            <span class="field-error">Correction reason is mandatory for financial auditability.</span>
          }
        </section>

        <!-- Real-Time Financial Impact Preview -->
        <section class="correction-section correction-section--preview" aria-label="Financial impact preview" data-testid="correction-impact-preview">
          <h3 class="correction-section__heading correction-section__heading--preview">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            Financial Impact Preview
          </h3>
          <div class="impact-preview-card">
            <ul class="impact-list">
              @for (line of impactLines(); track line) {
                <li class="impact-item">
                  <span class="impact-bullet" aria-hidden="true">•</span>
                  <span>{{ line }}</span>
                </li>
              }
            </ul>
          </div>
        </section>

        <!-- Error Alert -->
        @if (errorMessage(); as err) {
          <agrivio-ui-alert tone="danger" [message]="err" role="alert" data-testid="correction-dialog-error" />
        }

        <!-- Actions -->
        <div class="correction-actions">
          <button
            type="button"
            class="ag-btn ag-btn--secondary"
            (click)="onDismiss()"
            [disabled]="submitting()"
            data-testid="correction-cancel-btn"
          >
            Cancel
          </button>
          <button
            type="button"
            class="ag-btn"
            [class.ag-btn--danger]="mode() === 'reverse'"
            [class.ag-btn--primary]="mode() === 'correct'"
            (click)="onSubmit()"
            [disabled]="submitting()"
            data-testid="correction-submit-btn"
          >
            @if (submitting()) {
              <span class="ag-btn__spinner" aria-hidden="true"></span>
            }
            {{ submitLabel() }}
          </button>
        </div>
      }
    </agrivio-ui-dialog>
  `,
  styles: [`
    .correction-section { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 1.25rem; }
    .correction-section__heading { display: flex; align-items: center; gap: .5rem; font-size: .8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--ag-text-muted, #6b7280); margin: 0; }
    .correction-section__heading--preview { color: #0284c7; }
    .correction-readonly-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: .75rem 1rem; background: var(--ag-surface-raised, #f8f9fa); border: 1px solid var(--ag-border, #e5e7eb); border-radius: var(--ag-radius, 8px); padding: .875rem 1rem; }
    .correction-readonly-item { display: flex; flex-direction: column; gap: .125rem; }
    .correction-readonly-item--full { grid-column: 1 / -1; }
    .correction-readonly-label { font-size: .6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--ag-text-muted, #6b7280); }
    .correction-readonly-value { font-size: .875rem; color: var(--ag-text, #111827); }
    .correction-readonly-value--money { font-family: var(--ag-font-mono, monospace); font-weight: 700; color: #166534; font-size: 1rem; }
    .correction-mode-tabs { display: flex; gap: .5rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--ag-border, #e5e7eb); padding-bottom: .75rem; }
    .correction-tab-btn { display: inline-flex; align-items: center; gap: .5rem; padding: .5rem 1rem; border-radius: var(--ag-radius, 6px); font-size: .875rem; font-weight: 500; cursor: pointer; border: 1px solid var(--ag-border, #e5e7eb); background: #fff; color: var(--ag-text-muted, #4b5563); transition: all .15s ease; }
    .correction-tab-btn:hover { background: #f9fafb; color: var(--ag-text, #111827); }
    .correction-tab-btn--active { background: #eff6ff; border-color: #3b82f6; color: #1d4ed8; font-weight: 600; box-shadow: 0 1px 2px rgba(59,130,246,.1); }
    .correction-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: .75rem 1rem; }
    .form-field { display: flex; flex-direction: column; gap: .25rem; }
    .form-field--full { grid-column: 1 / -1; }
    .field-error { font-size: .75rem; color: #ef4444; margin-top: .125rem; }
    .char-count { font-size: .6875rem; color: var(--ag-text-muted, #9ca3af); text-align: right; }
    .char-count--warn { color: #f59e0b; }
    .impact-preview-card { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: var(--ag-radius, 8px); padding: .875rem 1rem; }
    .impact-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .375rem; }
    .impact-item { display: flex; align-items: flex-start; gap: .5rem; font-size: .8125rem; color: #0369a1; }
    .impact-bullet { font-weight: bold; flex-shrink: 0; }
    .correction-actions { display: flex; justify-content: flex-end; align-items: center; gap: .75rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--ag-border, #e5e7eb); }
    .ag-textarea { width: 100%; padding: .5rem .75rem; border: 1px solid var(--ag-border, #e5e7eb); border-radius: var(--ag-radius, 6px); font-size: .875rem; font-family: inherit; resize: vertical; box-sizing: border-box; }
    .ag-textarea:focus { outline: none; border-color: var(--ag-primary, #065f46); box-shadow: 0 0 0 3px rgba(6,95,70,.1); }
    .ag-textarea--error { border-color: #ef4444; }
    .ag-input { width: 100%; padding: .5rem .75rem; border: 1px solid var(--ag-border, #e5e7eb); border-radius: var(--ag-radius, 6px); font-size: .875rem; background: #fff; color: #111827; box-sizing: border-box; }
    .ag-input:focus { outline: none; border-color: var(--ag-primary, #065f46); box-shadow: 0 0 0 3px rgba(6,95,70,.1); }
    .ag-input--error { border-color: #ef4444; }
    .ag-select { width: 100%; padding: .5rem .75rem; border: 1px solid var(--ag-border, #e5e7eb); border-radius: var(--ag-radius, 6px); font-size: .875rem; background: #fff; color: #111827; box-sizing: border-box; cursor: pointer; }
    .allocation-targets { display: flex; flex-direction: column; gap: .625rem; margin-top: 1rem; }
    .allocation-targets h4 { margin: 0; font-size: .875rem; }
    .allocation-row { display: grid; grid-template-columns: 1fr 10rem; align-items: center; gap: 1rem; }
    .allocation-row div { display: flex; flex-direction: column; gap: .125rem; font-size: .8125rem; }
    .allocation-row span { color: var(--ag-text-muted, #6b7280); }
    .allocation-total { text-align: right; font-size: .8125rem; font-weight: 600; }
    .ag-btn__spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; margin-right: .375rem; vertical-align: middle; }
    .font-mono { font-family: var(--ag-font-mono, monospace); }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 640px) {
      .correction-readonly-grid, .correction-form-grid { grid-template-columns: 1fr; }
      .correction-mode-tabs { flex-direction: column; }
      .correction-actions { flex-direction: column-reverse; }
      .correction-actions .ag-btn { width: 100%; justify-content: center; }
    }
  `],
})
export class PaymentCorrectionDialogComponent {
  readonly open = input(false);
  readonly payment = input<PaymentCorrectionTarget | null>(null);
  readonly initialMode = input<'reverse' | 'correct'>('reverse');
  readonly submitting = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly accountOptions = input<DropdownOption[]>([]);
  readonly allocationTargets = input<PaymentCorrectionAllocationTarget[]>([]);

  readonly confirmed = output<PaymentCorrectionDialogResult>();
  readonly dismissed = output<void>();

  readonly mode = signal<'reverse' | 'correct'>('reverse');
  readonly reason = signal('');
  readonly replacementAmount = signal('');
  readonly replacementDate = signal('');
  readonly replacementAccountId = signal('');
  readonly replacementAllocationMode = signal<'general' | 'invoice_specific'>('general');
  readonly replacementNotes = signal('');
  readonly allocationAmounts = signal<Record<string, string>>({});
  readonly submitAttempted = signal(false);
  private attemptFingerprint = '';
  private attemptKey = '';

  readonly dialogTitle = computed(() => this.mode() === 'reverse' ? 'Reverse Payment' : 'Correct Payment');
  readonly submitLabel = computed(() => {
    if (this.submitting()) return 'Processing…';
    return this.mode() === 'reverse' ? 'Confirm Reversal' : 'Post Replacement Payment';
  });

  readonly isAmountValid = computed(() => {
    if (this.mode() !== 'correct') return true;
    const val = parseFloat(this.replacementAmount());
    return !isNaN(val) && val > 0;
  });
  readonly selectedAccountLabel = computed(
    () => this.accountOptions().find((item) => item.value === this.replacementAccountId())?.label ?? '',
  );
  readonly allocationTotal = computed(() => {
    const totalMinor = this.selectedAllocations().reduce(
      (sum, item) => sum + this.toMinorUnits(item.amount),
      0,
    );
    return (totalMinor / 100).toFixed(2);
  });
  readonly isAllocationValid = computed(() => {
    if (this.mode() !== 'correct' || this.replacementAllocationMode() !== 'invoice_specific') {
      return true;
    }
    const allocations = this.selectedAllocations();
    if (allocations.length === 0) return false;
    const targets = new Map(this.allocationTargets().map((item) => [item.id, item]));
    const allocatedMinor = allocations.reduce((sum, item) => sum + this.toMinorUnits(item.amount), 0);
    if (allocatedMinor !== this.toMinorUnits(this.replacementAmount())) return false;
    return allocations.every((item) => {
      const target = targets.get(item.targetId);
      return target && this.toMinorUnits(item.amount) <= this.toMinorUnits(target.outstandingAmount);
    });
  });

  readonly impactLines = computed((): string[] => {
    const p = this.payment();
    if (!p) return [];
    const origAmt = `${p.amount.currency} ${this.formatMoney(p.amount.amount)}`;
    const partyLabel = p.partyType === 'customer' ? 'Customer receivable' : 'Supplier payable';

    if (this.mode() === 'reverse') {
      return [
        `Original ${origAmt} payment will be fully reversed atomically.`,
        `${partyLabel} balance will be restored by ${origAmt}.`,
        `Cash/Bank account ${p.accountId} will reflect the reversal of ${origAmt}.`,
        'All associated allocation records will be marked reversed.',
      ];
    }

    const lines: string[] = [
      `Original ${origAmt} payment will be reversed.`,
    ];
    const newAmtVal = parseFloat(this.replacementAmount());
    if (!isNaN(newAmtVal) && newAmtVal > 0) {
      const origAmtVal = parseFloat(p.amount.amount);
      const diff = newAmtVal - origAmtVal;
      lines.push(`Replacement payment of PKR ${this.formatMoney(this.replacementAmount())} will be posted.`);
      if (Math.abs(diff) > 0.001) {
        const diffText = diff > 0
          ? `+PKR ${this.formatMoney(String(diff))}`
          : `-PKR ${this.formatMoney(String(Math.abs(diff)))}`;
        lines.push(`Net payment adjustment: ${diffText}.`);
      }
    }
    const acct = this.replacementAccountId().trim() || p.accountId;
    lines.push(`Posting to cash/bank account: ${acct}.`);
    lines.push('Replacement will re-run allocation rules (oldest-first for general).');
    return lines;
  });

  constructor() {
    effect(() => {
      const p = this.payment();
      const isOpen = this.open();
      if (isOpen && p) {
        this.mode.set(this.initialMode());
        this.replacementAmount.set(p.amount.amount);
        this.replacementDate.set(p.paymentDate);
        this.replacementAccountId.set(p.accountId);
        this.replacementAllocationMode.set(
          p.allocationMode === 'invoice_specific' ? 'invoice_specific' : 'general',
        );
        this.replacementNotes.set(p.notes ?? '');
        this.allocationAmounts.set({});
        this.reason.set('');
        this.submitAttempted.set(false);
        this.attemptFingerprint = '';
        this.attemptKey = '';
      }
    });
  }

  setMode(m: 'reverse' | 'correct'): void {
    this.mode.set(m);
    this.submitAttempted.set(false);
  }

  allocationAmount(targetId: string): string {
    return this.allocationAmounts()[targetId] ?? '';
  }

  setAllocationAmount(targetId: string, amount: string): void {
    this.allocationAmounts.update((current) => ({ ...current, [targetId]: String(amount ?? '') }));
  }

  onDismiss(): void {
    if (this.submitting()) return;
    this.dismissed.emit();
  }

  onSubmit(): void {
    this.submitAttempted.set(true);
    if (!this.reason().trim()) return;

    const p = this.payment();
    if (!p) return;

    if (this.mode() === 'correct') {
      if (!this.isAmountValid()) return;
      if (!this.replacementDate().trim()) return;
      if (!this.replacementAccountId().trim()) return;
      if (!this.isAllocationValid()) return;
    }

    const replacement = this.mode() === 'correct'
      ? {
          accountId: this.replacementAccountId().trim(),
          amount: {
            amount: (this.toMinorUnits(this.replacementAmount()) / 100).toFixed(2),
            currency: p.amount.currency || 'PKR',
          },
          paymentDate: this.replacementDate().trim(),
          allocationMode: this.replacementAllocationMode(),
          ...(this.replacementAllocationMode() === 'invoice_specific'
            ? {
                allocations: this.selectedAllocations().map((item) => ({
                  targetId: item.targetId,
                  amount: {
                    amount: (this.toMinorUnits(item.amount) / 100).toFixed(2),
                    currency: p.amount.currency || 'PKR',
                  },
                })),
              }
            : {}),
          notes: this.replacementNotes().trim(),
        }
      : null;
    const fingerprint = JSON.stringify({
      paymentId: p.id,
      mode: this.mode(),
      reason: this.reason().trim(),
      replacement,
    });
    if (fingerprint !== this.attemptFingerprint) {
      this.attemptFingerprint = fingerprint;
      this.attemptKey = `corr-${p.id}-${crypto.randomUUID()}`;
    }
    const idempotencyKey = this.attemptKey;

    if (this.mode() === 'reverse') {
      this.confirmed.emit({
        paymentId: p.id,
        mode: 'reverse',
        reason: this.reason().trim(),
        replacement: null,
        idempotencyKey,
      });
    } else {
      this.confirmed.emit({
        paymentId: p.id,
        mode: 'correct',
        reason: this.reason().trim(),
        replacement,
        idempotencyKey,
      });
    }
  }

  private selectedAllocations(): { targetId: string; amount: string }[] {
    return Object.entries(this.allocationAmounts())
      .filter(([, amount]) => this.toMinorUnits(amount) > 0)
      .map(([targetId, amount]) => ({ targetId, amount }));
  }

  private toMinorUnits(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
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
}
