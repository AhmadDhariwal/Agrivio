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
  templateUrl: './payment-detail-dialog.component.html',
  styleUrl: './payment-detail-dialog.component.scss',
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
    return !p.correctionOfId && !p.correctionStatus && !p.replacementPaymentId;
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
