import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { PurchasesApi } from '../../data-access/purchases.api';
import { ReturnsApi } from '../../data-access/returns.api';
import {
  MoneyAmount,
  PurchaseRecord,
  PurchaseReturnLineInput,
} from '../../models/purchases.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { PurchaseCancelDialogComponent } from '../../components/purchase-cancel-dialog/purchase-cancel-dialog.component';
import { formatAppDate, formatAppDateTime } from '../../../../shared/format/date-time.util';

@Component({
  selector: 'agrivio-purchase-detail-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiConfirmDialogComponent,
    PurchaseCancelDialogComponent,
  ],
  templateUrl: './purchase-detail.page.html',
  styleUrl: './purchase-detail.page.scss',
})
export class PurchaseDetailPage {
  private readonly api = inject(PurchasesApi);
  private readonly returnsApi = inject(ReturnsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly purchase = signal<PurchaseRecord | null>(null);

  // Dialog & Action states
  readonly cancelDialogOpen = signal(false);
  readonly cancelling = signal(false);
  readonly cancelError = signal<string | null>(null);

  readonly discardDialogOpen = signal(false);
  readonly discarding = signal(false);

  readonly returnDrawerOpen = signal(false);
  readonly submittingReturn = signal(false);
  readonly returnError = signal<string | null>(null);

  readonly returnForm = this.fb.nonNullable.group({
    reason: [''],
    lines: this.fb.array<FormGroup>([]),
  });

  get returnLines(): FormArray {
    return this.returnForm.controls.lines;
  }

  // State checks
  readonly isDraft = computed(() => this.purchase()?.status === 'draft');
  readonly isCancelled = computed(
    () => this.purchase()?.status === 'cancelled' && !this.purchase()?.replacementPurchaseId,
  );
  readonly isCorrected = computed(
    () =>
      Boolean(this.purchase()?.replacementPurchaseId) ||
      this.purchase()?.correctionStatus === 'corrected',
  );
  readonly isReplacement = computed(
    () =>
      Boolean(this.purchase()?.originalPurchaseId) ||
      this.purchase()?.correctionStatus === 'replacement',
  );
  readonly isPostedActive = computed(
    () =>
      this.purchase()?.status === 'posted' &&
      !this.isCorrected() &&
      !this.isCancelled(),
  );

  // Permissions & Capabilities
  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('purchases.view') &&
      (this.capabilityService?.canUseModule('purchases') ?? true) &&
      (this.capabilityService?.canPerformAction('purchases.actions.inspect') ?? true),
  );

  readonly canEdit = computed(
    () =>
      this.isDraft() &&
      this.sessionStore.hasPermission('purchases.create') &&
      (this.capabilityService?.canUseModule('purchases') ?? true) &&
      (this.capabilityService?.canPerformAction('purchases.actions.editDraft') ?? true),
  );

  readonly canDiscardDraft = computed(
    () =>
      this.isDraft() &&
      this.sessionStore.hasPermission('purchases.create') &&
      (this.capabilityService?.canUseModule('purchases') ?? true) &&
      (this.capabilityService?.canPerformAction('purchases.actions.discardDraft') ?? true),
  );

  readonly canPostDraft = computed(
    () =>
      this.isDraft() &&
      this.sessionStore.hasPermission('purchases.post') &&
      (this.capabilityService?.canUseModule('purchases') ?? true) &&
      (this.capabilityService?.canPerformAction('purchases.actions.post') ?? true),
  );

  readonly canCancel = computed(
    () =>
      this.isPostedActive() &&
      this.sessionStore.hasPermission('purchases.cancel') &&
      (this.capabilityService?.canUseModule('purchases') ?? true) &&
      (this.capabilityService?.canPerformAction('purchases.actions.cancel') ?? true),
  );

  readonly canCorrect = computed(
    () =>
      this.isPostedActive() &&
      this.sessionStore.hasPermission('purchases.cancel') &&
      this.sessionStore.hasPermission('purchases.post') &&
      (this.capabilityService?.canUseModule('purchases') ?? true) &&
      (this.capabilityService?.canPerformAction('purchases.actions.cancel') ?? true) &&
      (this.capabilityService?.canPerformAction('purchases.actions.post') ?? true),
  );

  readonly canReturn = computed(
    () =>
      this.isPostedActive() &&
      this.sessionStore.hasPermission('purchases.return') &&
      this.sessionStore.hasPermission('returns.post') &&
      (this.capabilityService?.canUseModule('purchases') ?? true) &&
      (this.capabilityService?.canPerformAction('purchases.actions.createReturn') ?? true) &&
      (this.capabilityService?.canUseModule('returns') ?? true) &&
      (this.capabilityService?.canPerformAction('returns.actions.post') ?? true),
  );

  constructor() {
    this.loadPurchase();
  }

  loadPurchase(forceRefresh = false): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }
    this.api.getPurchase(id, { forceRefresh }).subscribe({
      next: (purchase) => {
        this.purchase.set(purchase);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load purchase details.')
            : 'Unable to load purchase details.',
        );
        this.loading.set(false);
      },
    });
  }

  canViewField(id: string): boolean {
    return this.capabilityService?.canViewField(`purchases.fields.${id}`) ?? true;
  }

  statusTone(status: string): UiBadgeTone {
    if (this.isCorrected()) return 'warning';
    if (status === 'posted') return 'success';
    if (status === 'cancelled') return 'danger';
    if (status === 'draft') return 'warning';
    return 'neutral';
  }

  statusLabel(item: PurchaseRecord | null): string {
    if (!item) return '';
    if (item.replacementPurchaseId || item.correctionStatus === 'corrected') return 'CORRECTED';
    if (item.status === 'cancelled') return 'CANCELLED';
    if (item.status === 'posted') return 'POSTED';
    if (item.status === 'draft') return 'DRAFT';
    return item.status.toUpperCase();
  }

  formatPurchaseNumber(id: string | null | undefined): string {
    if (!id) return '';
    return 'Purchase #' + id.slice(-6).toUpperCase();
  }

  formatMoney(value: MoneyAmount | null | undefined): string {
    if (!value) return '—';
    const amount = Number(value.amount);
    const display = Number.isFinite(amount)
      ? amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.amount;
    return `${value.currency || 'PKR'} ${display}`;
  }

  formatQuantity(quantity: string | number | undefined | null): string {
    if (quantity === undefined || quantity === null || quantity === '') return '0';
    const num = typeof quantity === 'number' ? quantity : parseFloat(quantity);
    if (isNaN(num)) return String(quantity);
    if (Number.isInteger(num)) {
      return num.toLocaleString('en-PK');
    }
    return num.toLocaleString('en-PK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }

  formatDate(value: string | null | undefined): string {
    return formatAppDate(value);
  }

  formatDateTime(value: string | null | undefined): string {
    return formatAppDateTime(value);
  }

  // Cancellation
  openCancelDialog(): void {
    if (!this.canCancel()) return;
    this.cancelError.set(null);
    this.cancelDialogOpen.set(true);
  }

  onCancelConfirmed(event: { reason: string }): void {
    const item = this.purchase();
    if (!item || !this.canCancel() || this.cancelling()) return;

    this.cancelling.set(true);
    this.cancelError.set(null);
    this.api
      .cancelPurchase(
        item.id,
        { reason: event.reason, expectedVersion: item.version },
        crypto.randomUUID(),
      )
      .subscribe({
        next: (cancelledRecord) => {
          this.cancelling.set(false);
          this.cancelDialogOpen.set(false);
          this.purchase.set(cancelledRecord);
          this.successMessage.set(
            'Purchase cancelled successfully. Compensating inventory and financial entries have been posted.',
          );
        },
        error: (error: unknown) => {
          this.cancelling.set(false);
          this.cancelError.set(this.mapConflictError(error, 'Unable to cancel purchase.'));
        },
      });
  }

  onCancelDismissed(): void {
    this.cancelDialogOpen.set(false);
    this.cancelError.set(null);
  }

  // Discard draft
  openDiscardDialog(): void {
    if (!this.canDiscardDraft()) return;
    this.discardDialogOpen.set(true);
  }

  onDiscardConfirmed(): void {
    const item = this.purchase();
    if (!item || !this.canDiscardDraft() || this.discarding()) return;

    this.discarding.set(true);
    this.api.discardPurchase(item.id).subscribe({
      next: () => {
        this.discarding.set(false);
        this.discardDialogOpen.set(false);
        void this.router.navigateByUrl('/app/purchases');
      },
      error: (error: unknown) => {
        this.discarding.set(false);
        this.discardDialogOpen.set(false);
        this.errorMessage.set(this.mapConflictError(error, 'Unable to discard purchase draft.'));
      },
    });
  }

  // Return items
  toggleReturnDrawer(): void {
    if (!this.canReturn()) return;
    const current = this.returnDrawerOpen();
    if (!current) {
      this.initReturnForm();
    }
    this.returnDrawerOpen.set(!current);
    this.returnError.set(null);
  }

  private initReturnForm(): void {
    this.returnLines.clear();
    const item = this.purchase();
    if (!item?.lines) return;

    item.lines.forEach((line, index) => {
      this.returnLines.push(
        this.fb.group({
          originalLineIndex: [index],
          quantity: ['0'],
        }),
      );
    });
  }

  returnLineGroup(index: number): FormGroup {
    return this.returnLines.at(index) as FormGroup;
  }

  submitReturn(): void {
    const item = this.purchase();
    if (!item || !this.canReturn() || this.submittingReturn()) return;

    const raw = this.returnLines.getRawValue() as Array<{
      originalLineIndex: number;
      quantity: string;
    }>;
    const lines: PurchaseReturnLineInput[] = raw
      .map((l) => ({
        originalLineIndex: Number(l.originalLineIndex),
        quantity: String(l.quantity ?? '').trim(),
      }))
      .filter((l) => {
        const q = parseFloat(l.quantity);
        return Number.isFinite(q) && q > 0;
      });

    if (lines.length === 0) {
      this.returnError.set('Specify at least one line with quantity greater than 0 to return.');
      return;
    }

    const reason = this.returnForm.controls.reason.value.trim() || 'Physical purchase return';
    this.submittingReturn.set(true);
    this.returnError.set(null);

    this.returnsApi
      .createReturn(item.id, { lines, reason })
      .pipe(
        switchMap((ret) =>
          this.returnsApi.postReturn(
            ret.id,
            { reason, expectedVersion: ret.version, resolution: 'ledger_adjustment' },
            crypto.randomUUID(),
          ),
        ),
      )
      .subscribe({
        next: () => {
          this.submittingReturn.set(false);
          this.returnDrawerOpen.set(false);
          this.successMessage.set('Purchase return posted successfully.');
          this.loadPurchase(true);
        },
        error: (error: unknown) => {
          this.submittingReturn.set(false);
          this.returnError.set(this.mapConflictError(error, 'Unable to submit purchase return.'));
        },
      });
  }

  private mapConflictError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    const message: string =
      error.error?.error?.message ?? error.error?.message ?? '';

    if (message.includes('posted purchase returns exist')) {
      return 'This Purchase has dependent posted Purchase Returns. Reverse the dependent return before cancelling.';
    }
    if (message.includes('Supplier Payment allocations')) {
      return 'This Purchase has a Supplier Payment allocated to it. Reverse or correct that payment before cancelling or correcting the Purchase.';
    }
    if (message.includes('insufficient') || message.includes('consumed')) {
      return 'Cannot reverse original purchase stock because received inventory has already been sold, consumed, or transferred.';
    }
    if (message.includes('modified by another request')) {
      return 'Purchase was modified by another request. Reload and try again.';
    }
    if (error.status === 409) {
      if (message) return message;
      return 'This purchase changed elsewhere or has a conflict. Reload and try again.';
    }
    return message || fallback;
  }
}
