import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BillingRecordSummary, SubscriptionApi } from '../subscriptions/subscription.api';
import { UiPageHeaderComponent } from '../../shared/ui/ui-page-header.component';
import { UiAlertComponent } from '../../shared/ui/ui-alert.component';
import { UiEmptyStateComponent } from '../../shared/ui/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../shared/ui/ui-loading-state.component';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../shared/ui/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../shared/ui/ui-confirm-dialog.component';

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
  ],
  templateUrl: './billing-review.page.html',
  styleUrl: './billing-review.page.scss',
})
export class PlatformBillingReviewPage {
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly formBuilder = inject(FormBuilder);

  readonly items = signal<BillingRecordSummary[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('Confirm action');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Confirm');
  readonly confirmDanger = signal(false);
  private pendingAction: (() => void) | null = null;

  readonly rejectForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3)]],
  });

  constructor() {
    this.reload();
  }

  statusTone(status: string): UiBadgeTone {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending_review':
      case 'submitted':
        return 'warning';
      case 'rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  reload(): void {
    this.loading.set(true);
    this.subscriptionApi.listPlatformBillingRecords().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load billing review queue.');
      },
    });
  }

  askApprove(item: BillingRecordSummary): void {
    this.confirmTitle.set('Approve billing evidence?');
    this.confirmMessage.set(
      `Approve payment reference ${item.paymentReferenceNormalized}. This is a consequential subscription action.`,
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
}
