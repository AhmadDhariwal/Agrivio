import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';

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
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('Confirm action');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Confirm');
  readonly confirmDanger = signal(false);
  private pendingAction: (() => void) | null = null;

  readonly fieldRequired = hasRequiredValidator;

  readonly filterForm = this.formBuilder.nonNullable.group({
    status: [''],
    organizationId: [''],
    q: [''],
  });

  readonly rejectForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3)]],
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

  statusTone(status: string): UiBadgeTone {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending_review':
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

  reload(): void {
    this.loading.set(true);
    const raw = this.filterForm.getRawValue();
    this.subscriptionApi
      .listPlatformBillingRecords({
        ...(raw.status === '' ? {} : { status: raw.status }),
        ...(raw.organizationId === '' ? {} : { organizationId: raw.organizationId }),
        ...(raw.q.trim() === '' ? {} : { q: raw.q.trim() }),
        limit: 25,
        offset: 0,
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
    if (this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
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
    this.errorMessage.set(null);
    this.subscriptionApi.startBillingReview(item.id, item.version).subscribe({
      next: () => {
        this.successMessage.set(`Started review for ${item.id}`);
        this.reload();
      },
      error: () => this.errorMessage.set('Start review failed.'),
    });
  }

  approve(item: BillingRecordSummary): void {
    this.errorMessage.set(null);
    this.subscriptionApi.approveBilling(item.id, item.version).subscribe({
      next: () => {
        this.successMessage.set(`Approved ${item.id}`);
        this.reload();
      },
      error: () => this.errorMessage.set('Approve failed.'),
    });
  }

  reject(item: BillingRecordSummary): void {
    this.errorMessage.set(null);
    if (this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
      this.errorMessage.set('Rejection reason is required.');
      return;
    }
    this.subscriptionApi
      .rejectBilling(item.id, item.version, this.rejectForm.getRawValue().reason)
      .subscribe({
        next: () => {
          this.successMessage.set(`Rejected ${item.id}`);
          this.reload();
        },
        error: () => this.errorMessage.set('Reject failed.'),
      });
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
}
