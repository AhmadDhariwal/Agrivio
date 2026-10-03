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
  templateUrl: './payment-correction-dialog.component.html',
  styleUrl: './payment-correction-dialog.component.scss',
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
