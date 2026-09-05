import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ReturnsApi } from '../../data-access/returns.api';
import {
  MoneyAmount,
  SalesReturnRecord,
  returnResolutionLabel,
  returnTypeLabel,
} from '../../models/returns.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';

@Component({
  selector: 'agrivio-return-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiConfirmDialogComponent,
  ],
  templateUrl: './return-detail.page.html',
  styleUrl: './return-detail.page.scss',
})
export class ReturnDetailPage {
  private readonly api = inject(ReturnsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly reversing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly record = signal<SalesReturnRecord | null>(null);
  readonly reverseDialogOpen = signal(false);
  readonly canView = computed(() => this.sessionStore.hasPermission('returns.view'));
  readonly canReverse = computed(
    () =>
      this.sessionStore.hasPermission('returns.reverse') &&
      (this.capabilityService?.canPerformAction('returns.actions.reverse') ?? true),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }
    this.api.getReturn(id).subscribe({
      next: (record) => {
        this.record.set(record);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load return.'));
      },
    });
  }

  typeLabel(value: string): string {
    return returnTypeLabel(value);
  }

  typeBadgeLabel(returnType: string): string {
    if (returnType === 'sales') return 'SALES RETURN';
    if (returnType === 'purchase') return 'PURCHASE RETURN';
    if (returnType === 'sales_without_invoice') return 'WITHOUT INVOICE';
    return returnType ? returnType.toUpperCase() : 'RETURN';
  }

  typeBadgeClass(returnType: string): string {
    if (returnType === 'sales') return 'type-badge type-badge--sales';
    if (returnType === 'purchase') return 'type-badge type-badge--purchase';
    if (returnType === 'sales_without_invoice') return 'type-badge type-badge--without-invoice';
    return 'type-badge';
  }

  resolutionLabel(value: string): string {
    return returnResolutionLabel(value);
  }

  warehouseName(record: SalesReturnRecord): string {
    return record.warehouseNameSnapshot ?? 'Warehouse';
  }

  partyLabel(record: SalesReturnRecord): string {
    if (record.customerIdentifyingName) {
      return record.customerIdentifyingName;
    }
    if (record.customerNameSnapshot) {
      return record.customerNameSnapshot;
    }
    if (record.supplierNameSnapshot) {
      return record.supplierNameSnapshot;
    }
    if (record.customerId) {
      return 'Customer';
    }
    if (record.supplierId) {
      return 'Supplier';
    }
    return '—';
  }

  refundAccountName(record: SalesReturnRecord): string {
    if (!record.refundAccountId) {
      return '—';
    }
    if (record.refundAccountNameSnapshot) {
      const type = record.refundAccountTypeSnapshot ? ` (${record.refundAccountTypeSnapshot})` : '';
      return `${record.refundAccountNameSnapshot}${type}`;
    }
    return 'Refund account';
  }

  postedByName(record: SalesReturnRecord): string {
    return record.postedByName || record.postedBy || 'Authorized User';
  }

  reversedByName(record: SalesReturnRecord): string {
    return record.reversedByName || record.reversedBy || 'Authorized User';
  }

  createdByName(record: SalesReturnRecord): string {
    return record.createdByName || record.createdBy || 'Staff';
  }

  approverName(record: SalesReturnRecord): string {
    return (
      record.withoutInvoiceApproval?.approvedByName ||
      record.withoutInvoiceApproval?.approvedBy ||
      'Authorized Manager'
    );
  }

  statusTone(status: string): UiBadgeTone {
    if (status === 'posted') return 'success';
    if (status === 'reversed') return 'warning';
    if (status === 'draft') return 'neutral';
    return 'neutral';
  }

  formatMoney(amount: MoneyAmount | null | undefined): string {
    if (!amount || amount.amount === undefined || amount.amount === null) {
      return '—';
    }
    const num = Number(amount.amount);
    const formatted = isNaN(num)
      ? amount.amount
      : num.toLocaleString('en-PK', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
    return `${amount.currency || 'PKR'} ${formatted}`;
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return `${date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })} ${date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`;
  }

  openReverseDialog(): void {
    const current = this.record();
    if (!current || !this.canReverse() || current.status !== 'posted' || this.reversing()) {
      return;
    }
    this.reverseDialogOpen.set(true);
  }

  onDismissReverse(): void {
    this.reverseDialogOpen.set(false);
  }

  onConfirmReverse(reason: string): void {
    const current = this.record();
    if (!current || !this.canReverse() || current.status !== 'posted' || this.reversing()) {
      return;
    }
    const trimmed = reason.trim();
    if (trimmed === '') {
      this.errorMessage.set('A reversal reason is required.');
      return;
    }

    this.reversing.set(true);
    this.reverseDialogOpen.set(false);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.api
      .reverseReturn(
        current.id,
        { reason: trimmed, expectedVersion: current.version },
        `return-reverse-${current.id}-${Date.now()}`,
      )
      .subscribe({
        next: (updated) => {
          this.record.set(updated);
          this.reversing.set(false);
          this.successMessage.set(
            'Return reversed with a linked corrective transaction. The original return record is preserved in history.',
          );
        },
        error: (error: unknown) => {
          this.reversing.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to reverse return.'));
        },
      });
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.status === 403) {
      return error.error?.error?.message ?? 'You do not have permission for this action.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
