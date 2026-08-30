import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  SubscriptionApi,
  BillingSubmitPayload,
  BillingRecordSummary,
  SubscriptionPlanSummary,
  BillingEvidenceUploadResult,
} from '../../data-access/subscription.api';
import { SubscriptionStatusBannerComponent } from '../../components/subscription-status-banner/subscription-status-banner.component';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SubscriptionAccessState } from '../../data-access/subscription-access.util';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

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
    UiFieldLabelComponent,
  ],
  templateUrl: './billing-evidence.page.html',
  styleUrl: './billing-evidence.page.scss',
})
export class BillingEvidencePage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly submitting = signal(false);
  readonly uploading = signal(false);
  readonly loadingHistory = signal(true);
  readonly loadingPlans = signal(true);
  readonly historyError = signal<string | null>(null);
  readonly plansError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly records = signal<BillingRecordSummary[]>([]);
  readonly plans = signal<SubscriptionPlanSummary[]>([]);
  readonly uploadedEvidence = signal<BillingEvidenceUploadResult | null>(null);
  readonly selectedFileName = signal<string | null>(null);
  readonly subscriptionDetail = signal<Record<string, unknown> | null>(null);

  readonly accessState = computed(
    () =>
      (this.sessionStore.session()?.subscriptionAccessState as SubscriptionAccessState | null) ??
      null,
  );

  readonly fieldRequired = hasRequiredValidator;

  selectedPlan(): SubscriptionPlanSummary | null {
    const planId = this.form.controls.requestedPlanId.value;
    return this.plans().find((plan) => plan.id === planId) ?? null;
  }

  listedPriceLabel(): string {
    const plan = this.selectedPlan();
    const period = this.form.controls.billingPeriod.value;
    if (plan === null) {
      return 'Select an active plan to see any listed price.';
    }
    const amount =
      period === 'annual' ? plan.annualPriceMinorUnits : plan.monthlyPriceMinorUnits;
    if (amount === null) {
      return `${period === 'annual' ? 'Annual' : 'Monthly'} listed price is unset. Enter the agreed amount in paisa.`;
    }
    return `Listed ${period} price: ${amount} ${plan.currency} paisa`;
  }

  readonly form = this.formBuilder.nonNullable.group({
    requestedPlanId: ['', Validators.required],
    paymentMethod: ['bank_transfer' as 'bank_transfer' | 'jazzcash' | 'easypaisa', Validators.required],
    billingPeriod: ['monthly' as 'monthly' | 'annual', Validators.required],
    submittedAmountMinorUnits: [0, [Validators.required, Validators.min(1)]],
    paymentReference: ['', [Validators.required, Validators.minLength(3)]],
    notes: [''],
  });

  constructor() {
    this.reloadPlans();
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
      case 'under_review':
      case 'grace':
        return 'warning';
      case 'rejected':
      case 'suspended':
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

  reloadPlans(): void {
    this.loadingPlans.set(true);
    this.plansError.set(null);
    this.subscriptionApi.listPlans().subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.loadingPlans.set(false);
        const firstPlan = plans[0];
        if (firstPlan !== undefined && this.form.controls.requestedPlanId.value === '') {
          this.form.controls.requestedPlanId.setValue(firstPlan.id);
        }
      },
      error: () => {
        this.loadingPlans.set(false);
        this.plansError.set('Unable to load selectable plans.');
      },
    });
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

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.uploadedEvidence.set(null);
    this.selectedFileName.set(file?.name ?? null);
    if (file === undefined) {
      return;
    }
    this.uploading.set(true);
    this.errorMessage.set(null);
    this.subscriptionApi.uploadBillingEvidence(file).subscribe({
      next: (uploaded) => {
        this.uploading.set(false);
        this.uploadedEvidence.set(uploaded);
      },
      error: () => {
        this.uploading.set(false);
        this.uploadedEvidence.set(null);
        this.errorMessage.set('Unable to upload payment evidence. Use PNG, JPEG, or PDF up to 5MB.');
      },
    });
  }

  downloadEvidence(item: BillingRecordSummary): void {
    this.subscriptionApi.downloadOrganizationEvidence(item.id).subscribe({
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

  submit(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please complete the billing evidence fields.');
      return;
    }
    const plan = this.selectedPlan();
    const evidence = this.uploadedEvidence();
    if (plan === null) {
      this.errorMessage.set('Select an active plan version.');
      return;
    }
    if (evidence === null) {
      this.errorMessage.set('Upload payment evidence before submitting.');
      return;
    }

    this.submitting.set(true);
    const raw = this.form.getRawValue();
    const payload: BillingSubmitPayload = {
      paymentMethod: raw.paymentMethod,
      billingPeriod: raw.billingPeriod,
      submittedAmountMinorUnits: Number(raw.submittedAmountMinorUnits),
      paymentReference: raw.paymentReference,
      evidenceStorageRef: evidence.evidenceStorageRef,
      requestedPlanCode: plan.planCode,
      requestedPlanVersion: plan.planVersion,
    };
    if (raw.notes.trim() !== '') {
      payload.notes = raw.notes.trim();
    }
    this.subscriptionApi.submitBillingEvidence(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.successMessage.set('Billing evidence submitted for Super Admin review.');
        this.uploadedEvidence.set(null);
        this.selectedFileName.set(null);
        this.reloadHistory();
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set('Unable to submit billing evidence.');
      },
    });
  }
}
