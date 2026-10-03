import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiDialogComponent } from '../../../../shared/ui/ui-dialog/ui-dialog.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { MoneyAmount, PurchaseRecord } from '../../models/purchases.models';
import { formatAppDate } from '../../../../shared/format/date-time.util';

@Component({
  selector: 'agrivio-purchase-cancel-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiDialogComponent,
    UiAlertComponent,
    UiFieldLabelComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './purchase-cancel-dialog.component.html',
  styleUrl: './purchase-cancel-dialog.component.scss',
})
export class PurchaseCancelDialogComponent {
  readonly open = input(false);
  readonly purchase = input<PurchaseRecord | null>(null);
  readonly submitting = input(false);
  readonly errorMessage = input<string | null>(null);

  readonly confirmed = output<{ reason: string }>();
  readonly dismissed = output<void>();

  readonly reason = signal('');
  readonly submitAttempted = signal(false);

  readonly trimmedReason = computed(() => this.reason().trim());
  readonly isReasonValid = computed(() => {
    const len = this.trimmedReason().length;
    return len >= 1 && len <= 1000;
  });

  readonly reasonError = computed(() => {
    if (!this.submitAttempted()) return null;
    const len = this.trimmedReason().length;
    if (len === 0) return 'Cancellation reason is required.';
    if (len > 1000) return 'Cancellation reason cannot exceed 1000 characters.';
    return null;
  });

  readonly purchaseRef = computed(() => {
    const p = this.purchase();
    if (!p) return '';
    return p.supplierInvoiceReference || ('Purchase #' + p.id.slice(-6).toUpperCase());
  });

  formatMoney(value: MoneyAmount | null | undefined): string {
    if (!value) return '—';
    const amount = Number(value.amount);
    const display = Number.isFinite(amount)
      ? amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.amount;
    return `${value.currency || 'PKR'} ${display}`;
  }

  formatDate(value: string | null | undefined): string {
    return formatAppDate(value);
  }

  onReasonChange(value: string): void {
    this.reason.set(value);
  }

  onSubmit(): void {
    this.submitAttempted.set(true);
    if (!this.isReasonValid() || this.submitting()) {
      return;
    }
    this.confirmed.emit({ reason: this.trimmedReason() });
  }

  onCancel(): void {
    this.reason.set('');
    this.submitAttempted.set(false);
    this.dismissed.emit();
  }
}
