import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SubscriptionApi, BillingSubmitPayload, BillingRecordSummary } from './subscription.api';
import { SubscriptionStatusBannerComponent } from './subscription-status-banner.component';
import { AuthSessionStore } from '../auth/auth-session.store';
import { SubscriptionAccessState } from './subscription-access.util';
import { UiPageHeaderComponent } from '../../shared/ui/ui-page-header.component';
import { UiAlertComponent } from '../../shared/ui/ui-alert.component';
import { UiEmptyStateComponent } from '../../shared/ui/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../shared/ui/ui-loading-state.component';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../shared/ui/ui-status-badge.component';

@Component({
  selector: 'agrivio-billing-evidence-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    SubscriptionStatusBannerComponent,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './billing-evidence.page.html',
  styleUrl: './billing-evidence.page.scss',
})
export class BillingEvidencePage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly submitting = signal(false);
  readonly loadingHistory = signal(true);
  readonly historyError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly records = signal<BillingRecordSummary[]>([]);
  readonly subscriptionDetail = signal<Record<string, unknown> | null>(null);

  readonly accessState = computed(
    () =>
      (this.sessionStore.session()?.subscriptionAccessState as SubscriptionAccessState | null) ??
      null,
  );

  readonly form = this.formBuilder.nonNullable.group({
    paymentMethod: ['bank_transfer' as 'bank_transfer' | 'jazzcash' | 'easypaisa', Validators.required],
    billingPeriod: ['monthly' as 'monthly' | 'annual', Validators.required],
    submittedAmountMinorUnits: [0, [Validators.required, Validators.min(1)]],
    paymentReference: ['', [Validators.required, Validators.minLength(3)]],
    evidenceStorageRef: ['', [Validators.required, Validators.maxLength(500)]],
    evidenceOriginalFileName: [''],
    requestedPlanCode: ['Starter', Validators.required],
    requestedPlanVersion: [1, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    this.reloadHistory();
    this.subscriptionApi.getSubscription().subscribe({
      next: (detail) => {
        if (detail !== null && typeof detail === 'object') {
          this.subscriptionDetail.set(detail as Record<string, unknown>);
        }
      },
      error: () => {
        // Subscription detail is optional for this page; banner still uses session state.
      },
    });
  }

  statusLabel(value: unknown): string {
    return typeof value === 'string' && value.trim() !== '' ? value : 'unknown';
  }

  statusTone(status: unknown): UiBadgeTone {
    switch (status) {
      case 'approved':
      case 'active':
      case 'trialing':
        return 'success';
      case 'pending_review':
      case 'submitted':
      case 'grace':
        return 'warning';
      case 'rejected':
      case 'suspended':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  reloadHistory(): void {
    this.loadingHistory.set(true);
    this.historyError.set(null);
    this.subscriptionApi.listBillingRecords().subscribe({
      next: (items) => {
        this.records.set(items);
        this.loadingHistory.set(false);
      },
      error: () => {
        this.loadingHistory.set(false);
        this.historyError.set('Unable to load billing history.');
      },
    });
  }

  submit(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please complete the billing evidence fields.');
      return;
    }

    this.submitting.set(true);
    const raw = this.form.getRawValue();
    const payload: BillingSubmitPayload = {
      paymentMethod: raw.paymentMethod,
      billingPeriod: raw.billingPeriod,
      submittedAmountMinorUnits: Number(raw.submittedAmountMinorUnits),
      paymentReference: raw.paymentReference,
      evidenceStorageRef: raw.evidenceStorageRef,
      requestedPlanCode: raw.requestedPlanCode,
      requestedPlanVersion: Number(raw.requestedPlanVersion),
    };
    if (raw.evidenceOriginalFileName.trim() !== '') {
      payload.evidenceOriginalFileName = raw.evidenceOriginalFileName.trim();
    }
    this.subscriptionApi.submitBillingEvidence(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.successMessage.set('Billing evidence submitted for Super Admin review.');
        this.reloadHistory();
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set('Unable to submit billing evidence.');
      },
    });
  }
}
