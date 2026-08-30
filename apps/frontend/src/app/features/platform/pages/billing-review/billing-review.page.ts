import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  BillingRecordSummary,
  PlatformBillingQueue,
  SubscriptionApi,
} from '../../../subscriptions/data-access/subscription.api';
import {
  PlatformOrganizationSummary,
  PlatformOrganizationsApi,
} from '../../data-access/platform-organizations.api';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';

@Component({
  selector: 'agrivio-platform-billing-review-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiConfirmDialogComponent,
    UiFieldLabelComponent,
    UiPaginationComponent,
  ],
  templateUrl: './billing-review.page.html',
  styleUrl: './billing-review.page.scss',
})
export class PlatformBillingReviewPage {
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly organizationsApi = inject(PlatformOrganizationsApi);
  private readonly formBuilder = inject(FormBuilder);

  readonly items = signal<BillingRecordSummary[]>([]);
  readonly organizations = signal<PlatformOrganizationSummary[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly actionInProgress = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly rejectReasons = signal<Record<string, string>>({});
  readonly rejectTouched = signal<Record<string, boolean>>({});

  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('Confirm action');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Confirm');
  readonly confirmDanger = signal(false);
  private pendingAction: (() => void) | null = null;

  readonly filterForm = this.formBuilder.nonNullable.group({
    status: [''],
    organizationId: [''],
    q: [''],
  });

  constructor() {
    this.organizationsApi.list({ page: 1, pageSize: 100 }).subscribe({
      next: (page) => this.organizations.set(page.items),
      error: () => {
        // Organization names are helpful but not required to review billing records.
      },
    });
    this.reload();
  }

  organizationName(organizationId: string): string {
    const match = this.organizations().find((item) => item.id === organizationId);
    return match?.name ? `${match.name} (${organizationId})` : organizationId;
  }

  canReview(item: BillingRecordSummary): boolean {
    return item.status === 'submitted' || item.status === 'under_review';
  }

  actionsDisabled(): boolean {
    return this.loading() || this.actionInProgress();
  }

  rejectReason(id: string): string {
    return this.rejectReasons()[id] ?? '';
  }

  setRejectReason(id: string, value: string): void {
    this.rejectReasons.update((current) => ({ ...current, [id]: value }));
  }

  onRejectReasonInput(id: string, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.setRejectReason(id, target.value);
    }
  }

  markRejectTouched(id: string): void {
    this.rejectTouched.update((current) => ({ ...current, [id]: true }));
  }

  isRejectReasonValid(id: string): boolean {
    return this.rejectReason(id).trim().length >= 3;
  }

  showRejectReasonError(id: string): boolean {
    return Boolean(this.rejectTouched()[id]) && !this.isRejectReasonValid(id);
  }

  statusTone(status: string): UiBadgeTone {
    switch (status) {
      case 'approved':
        return 'success';
      case 'submitted':
      case 'under_review':
        return 'warning';
      case 'rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  displayOrDash(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    return String(value);
  }

  onFilterSubmit(): void {
    this.page.set(1);
    this.reload();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.reload();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    const raw = this.filterForm.getRawValue();
    this.subscriptionApi
      .listPlatformBillingRecords({
        ...(raw.status === '' ? {} : { status: raw.status }),
        ...(raw.organizationId === '' ? {} : { organizationId: raw.organizationId }),
        ...(raw.q.trim() === '' ? {} : { q: raw.q.trim() }),
        limit: this.pageSize(),
        offset: (this.page() - 1) * this.pageSize(),
      })
      .subscribe({
        next: (page: PlatformBillingQueue) => {
          this.items.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('Unable to load billing review queue.');
        },
      });
  }

  askStartReview(item: BillingRecordSummary): void {
    if (this.actionsDisabled()) {
      return;
    }
    this.confirmTitle.set('Start billing review?');
    this.confirmMessage.set(
      `Move payment reference ${item.paymentReferenceNormalized} from submitted to under review.`,
    );
    this.confirmLabel.set('Start review');
    this.confirmDanger.set(false);
    this.pendingAction = () => this.startReview(item);
    this.confirmOpen.set(true);
  }

  askApprove(item: BillingRecordSummary): void {
    if (this.actionsDisabled()) {
      return;
    }
    this.confirmTitle.set('Approve billing evidence?');
    this.confirmMessage.set(
      `Approve ${this.organizationName(item.organizationId)} for ${item.requestedPlanCode} v${item.requestedPlanVersion}. This activates or extends the subscription once.`,
    );
    this.confirmLabel.set('Approve evidence');
    this.confirmDanger.set(false);
    this.pendingAction = () => this.approve(item);
    this.confirmOpen.set(true);
  }

  askReject(item: BillingRecordSummary): void {
    if (this.actionsDisabled()) {
      return;
    }
    this.markRejectTouched(item.id);
    if (!this.isRejectReasonValid(item.id)) {
      this.errorMessage.set('Rejection reason is required.');
      return;
    }
    this.confirmTitle.set('Reject billing evidence?');
    this.confirmMessage.set(`Reject payment reference ${item.paymentReferenceNormalized}.`);
    this.confirmLabel.set('Reject evidence');
    this.confirmDanger.set(true);
    this.pendingAction = () => this.reject(item);
    this.confirmOpen.set(true);
  }

  runConfirmedAction(): void {
    this.confirmOpen.set(false);
    const action = this.pendingAction;
    this.pendingAction = null;
    action?.();
  }

  startReview(item: BillingRecordSummary): void {
    this.runMutation(
      () => this.subscriptionApi.startBillingReview(item.id, item.version),
      `Started review for ${item.id}`,
      'Start review failed.',
    );
  }

  approve(item: BillingRecordSummary): void {
    this.runMutation(
      () => this.subscriptionApi.approveBilling(item.id, item.version),
      `Approved ${item.id}`,
      'Approve failed.',
    );
  }

  reject(item: BillingRecordSummary): void {
    this.markRejectTouched(item.id);
    if (!this.isRejectReasonValid(item.id)) {
      this.errorMessage.set('Rejection reason is required.');
      return;
    }
    const reason = this.rejectReason(item.id).trim();
    this.runMutation(
      () => this.subscriptionApi.rejectBilling(item.id, item.version, reason),
      `Rejected ${item.id}`,
      'Reject failed.',
    );
  }

  downloadEvidence(item: BillingRecordSummary): void {
    this.subscriptionApi.downloadPlatformEvidence(item.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = item.evidenceOriginalFileName || 'billing-evidence';
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.errorMessage.set('Unable to download billing evidence.'),
    });
  }

  private runMutation(
    request: () => ReturnType<SubscriptionApi['approveBilling']>,
    success: string,
    failure: string,
  ): void {
    if (this.actionInProgress()) {
      return;
    }
    this.errorMessage.set(null);
    this.actionInProgress.set(true);
    request().subscribe({
      next: () => {
        this.actionInProgress.set(false);
        this.successMessage.set(success);
        this.reload();
      },
      error: () => {
        this.actionInProgress.set(false);
        this.errorMessage.set(failure);
      },
    });
  }
}
