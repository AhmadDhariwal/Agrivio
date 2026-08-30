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
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import {
  fieldValidationMessage,
  hasRequiredValidator,
} from '../../../../shared/form/form-field.util';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

export const MAX_EVIDENCE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_EVIDENCE_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

/**
 * Converts minor-unit integer (e.g. 15000000) to human-readable PKR display (e.g. "PKR 150,000.00").
 * Pure integer arithmetic — no floating-point rounding errors.
 */
export function minorUnitsToDisplayPkr(
  minorUnits: number | null | undefined,
  includePrefix = true,
): string {
  if (minorUnits === null || minorUnits === undefined || Number.isNaN(minorUnits)) {
    return includePrefix ? 'PKR 0.00' : '0.00';
  }
  const isNegative = minorUnits < 0;
  const absVal = Math.abs(Math.round(minorUnits));
  const rupees = Math.floor(absVal / 100);
  const paisa = absVal % 100;
  const formattedRupees = rupees.toLocaleString('en-US');
  const formattedPaisa = String(paisa).padStart(2, '0');
  const prefix = includePrefix ? (isNegative ? '-PKR ' : 'PKR ') : isNegative ? '-' : '';
  return `${prefix}${formattedRupees}.${formattedPaisa}`;
}

/**
 * Converts human-readable PKR input string (e.g. "150,000.00" or "150000") to exact integer minor units.
 * Pure integer parsing without floating-point arithmetic.
 */
export function displayPkrToMinorUnits(
  input: string | number | null | undefined,
): number | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return Math.round(input);
  }
  const cleaned = input
    .trim()
    .replace(/^PKR\s*/i, '')
    .replace(/^Rs\.?\s*/i, '')
    .replace(/,/g, '');
  if (cleaned === '') {
    return null;
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    return null;
  }
  const rupeesPart = parseInt(match[1] ?? '0', 10);
  const paisaPart = parseInt((match[2] || '').padEnd(2, '0'), 10);
  return rupeesPart * 100 + paisaPart;
}

@Component({
  selector: 'agrivio-billing-evidence-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    SubscriptionStatusBannerComponent,
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

  // Loading states (kept distinct per Section 9)
  readonly submitting = signal(false);
  readonly uploading = signal(false);
  readonly loadingHistory = signal(true);
  readonly loadingPlans = signal(true);
  readonly loadingSubscription = signal(true);
  readonly loadingDetail = signal(false);

  // Errors & alerts
  readonly historyError = signal<string | null>(null);
  readonly plansError = signal<string | null>(null);
  readonly subscriptionError = signal<string | null>(null);
  readonly uploadError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  // Domain data
  readonly records = signal<BillingRecordSummary[]>([]);
  readonly plans = signal<SubscriptionPlanSummary[]>([]);
  readonly uploadedEvidence = signal<BillingEvidenceUploadResult | null>(null);
  readonly selectedFileName = signal<string | null>(null);
  readonly subscriptionDetail = signal<Record<string, unknown> | null>(null);
  readonly selectedRecord = signal<BillingRecordSummary | null>(null);

  // Form handling & UX
  readonly formSubmitAttempted = signal(false);
  readonly amountPkrInput = signal<string>('');

  readonly accessState = computed(
    () =>
      (this.sessionStore.session()?.subscriptionAccessState as SubscriptionAccessState | null) ??
      null,
  );

  readonly canSubmit = computed(() =>
    this.sessionStore.hasPermission('subscription.billing-evidence.submit'),
  );

  readonly isSuspended = computed(() => {
    const detail = this.subscriptionDetail();
    const access = this.accessState();
    return detail?.['status'] === 'suspended' || access?.status === 'suspended';
  });

  readonly activePlans = computed(() =>
    this.plans().filter((plan) => plan.status === 'active'),
  );

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly form = this.formBuilder.nonNullable.group({
    requestedPlanId: ['', Validators.required],
    paymentMethod: [
      'bank_transfer' as 'bank_transfer' | 'jazzcash' | 'easypaisa',
      Validators.required,
    ],
    billingPeriod: ['monthly' as 'monthly' | 'annual', Validators.required],
    submittedAmountMinorUnits: [0, [Validators.required, Validators.min(1)]],
    paymentReference: ['', [Validators.required, Validators.minLength(3)]],
    notes: [''],
  });

  constructor() {
    this.reloadPlans();
    this.reloadHistory();
    this.reloadSubscription();

    // Listen to billing period changes to update default amount if agreed price exists
    this.form.controls.billingPeriod.valueChanges.subscribe((period) => {
      const plan = this.selectedPlan();
      if (plan) {
        this.updateDefaultAmountForPlan(plan, period);
      }
    });

    // Listen to plan changes in the dropdown
    this.form.controls.requestedPlanId.valueChanges.subscribe((planId) => {
      const plan = this.plans().find((p) => p.id === planId);
      if (plan) {
        this.updateDefaultAmountForPlan(plan, this.form.controls.billingPeriod.value);
      }
    });
  }

  selectedPlan(): SubscriptionPlanSummary | null {
    const planId = this.form.controls.requestedPlanId.value;
    return this.plans().find((plan) => plan.id === planId) ?? null;
  }

  currentPlanCode(): string | null {
    const detail = this.subscriptionDetail();
    if (!detail || !detail['planCode']) return null;
    return String(detail['planCode']);
  }

  isCurrentPlan(plan: SubscriptionPlanSummary): boolean {
    const currentCode = this.currentPlanCode();
    return currentCode !== null && plan.planCode === currentCode;
  }

  isSelectedPlan(plan: SubscriptionPlanSummary): boolean {
    return this.form.controls.requestedPlanId.value === plan.id;
  }

  formatPrice(minorUnits: number | null | undefined): string {
    return minorUnitsToDisplayPkr(minorUnits, true);
  }

  formatDate(dateVal: unknown): string {
    if (!dateVal) return '—';
    try {
      const date = new Date(String(dateVal));
      if (Number.isNaN(date.getTime())) return String(dateVal);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return String(dateVal);
    }
  }

  formatDateTime(dateVal: unknown): string {
    if (!dateVal) return '—';
    try {
      const date = new Date(String(dateVal));
      if (Number.isNaN(date.getTime())) return String(dateVal);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(dateVal);
    }
  }

  formatPaymentMethod(method: unknown): string {
    switch (method) {
      case 'bank_transfer':
        return 'Bank transfer';
      case 'jazzcash':
        return 'JazzCash';
      case 'easypaisa':
        return 'Easypaisa';
      case 'monthly':
        return 'Monthly';
      case 'annual':
        return 'Annual';
      default:
        return typeof method === 'string' && method ? method : '—';
    }
  }

  statusLabel(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') return 'Unknown';
    switch (value) {
      case 'active':
        return 'Active';
      case 'trial':
      case 'trialing':
        return 'Trial';
      case 'grace':
        return 'Grace Period';
      case 'suspended':
        return 'Suspended';
      case 'submitted':
        return 'Submitted';
      case 'under_review':
        return 'Under Review';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'cancelled':
        return 'Cancelled';
      default:
        return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
    }
  }

  statusTone(status: unknown): UiBadgeTone {
    switch (status) {
      case 'approved':
      case 'active':
      case 'trial':
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

  formatFileSize(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  listedPriceDisplay(): string {
    const plan = this.selectedPlan();
    const period = this.form.controls.billingPeriod.value;
    if (!plan) {
      return 'Select an active plan to see listed price.';
    }
    const amount =
      period === 'annual' ? plan.annualPriceMinorUnits : plan.monthlyPriceMinorUnits;
    if (amount === null) {
      return `Listed ${period} price is unconfigured. Enter the agreed amount in PKR.`;
    }
    return `Listed ${period} price: ${minorUnitsToDisplayPkr(amount)}`;
  }

  amountPreviewDisplay(): string {
    const minorUnits = this.form.controls.submittedAmountMinorUnits.value;
    return minorUnitsToDisplayPkr(minorUnits);
  }

  onAmountInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    this.amountPkrInput.set(value);
    const parsed = displayPkrToMinorUnits(value);
    if (parsed !== null && parsed > 0) {
      this.form.controls.submittedAmountMinorUnits.setValue(parsed);
      this.form.controls.submittedAmountMinorUnits.markAsDirty();
    } else {
      this.form.controls.submittedAmountMinorUnits.setValue(0);
      this.form.controls.submittedAmountMinorUnits.markAsDirty();
    }
  }

  onAmountBlur(): void {
    const minorUnits = this.form.controls.submittedAmountMinorUnits.value;
    if (minorUnits > 0) {
      this.amountPkrInput.set(minorUnitsToDisplayPkr(minorUnits, false));
    }
  }

  private updateDefaultAmountForPlan(
    plan: SubscriptionPlanSummary,
    period: 'monthly' | 'annual',
  ): void {
    const price = period === 'annual' ? plan.annualPriceMinorUnits : plan.monthlyPriceMinorUnits;
    if (price !== null && price > 0) {
      this.form.controls.submittedAmountMinorUnits.setValue(price);
      this.amountPkrInput.set(minorUnitsToDisplayPkr(price, false));
    }
  }

  choosePlan(plan: SubscriptionPlanSummary, period?: 'monthly' | 'annual'): void {
    const currentPeriod = period || this.form.controls.billingPeriod.value;
    this.form.controls.requestedPlanId.setValue(plan.id);
    this.form.controls.billingPeriod.setValue(currentPeriod);
    this.updateDefaultAmountForPlan(plan, currentPeriod);
  }

  reloadPlans(forceRefresh = false): void {
    this.loadingPlans.set(true);
    this.plansError.set(null);
    this.subscriptionApi.listPlans(forceRefresh).subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.loadingPlans.set(false);
        const active = plans.filter((p) => p.status === 'active');
        const firstActive = active[0];
        if (firstActive !== undefined && this.form.controls.requestedPlanId.value === '') {
          this.form.controls.requestedPlanId.setValue(firstActive.id);
          this.updateDefaultAmountForPlan(firstActive, this.form.controls.billingPeriod.value);
        }
      },
      error: () => {
        this.loadingPlans.set(false);
        this.plansError.set('Unable to load selectable plans. Please try again.');
      },
    });
  }

  reloadHistory(forceRefresh = false): void {
    this.loadingHistory.set(true);
    this.historyError.set(null);
    this.subscriptionApi.listBillingRecords(forceRefresh).subscribe({
      next: (items) => {
        this.records.set(items);
        this.loadingHistory.set(false);
      },
      error: () => {
        this.loadingHistory.set(false);
        this.historyError.set('Unable to load billing history. Please try again.');
      },
    });
  }

  reloadSubscription(forceRefresh = false): void {
    this.loadingSubscription.set(true);
    this.subscriptionError.set(null);
    this.subscriptionApi.getSubscription(forceRefresh).subscribe({
      next: (detail) => {
        this.loadingSubscription.set(false);
        if (detail !== null && typeof detail === 'object') {
          this.subscriptionDetail.set(detail as Record<string, unknown>);
        }
      },
      error: () => {
        this.loadingSubscription.set(false);
        // Subscription detail is optional for this page; banner still uses session state.
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.uploadError.set(null);

    if (!file) {
      return;
    }

    // Client UX validation (backend remains authoritative)
    const fileType = (file.type || '').toLowerCase();
    const isAllowedType =
      ALLOWED_EVIDENCE_TYPES.includes(fileType) ||
      /\.(png|jpe?g|pdf)$/i.test(file.name);

    if (!isAllowedType) {
      this.uploadError.set(
        'Invalid file type. Only PNG, JPEG, and PDF documents are supported.',
      );
      input.value = '';
      return;
    }

    if (file.size > MAX_EVIDENCE_SIZE_BYTES) {
      this.uploadError.set(
        `File size exceeds 5MB limit (${this.formatFileSize(file.size)}).`,
      );
      input.value = '';
      return;
    }

    this.uploadedEvidence.set(null);
    this.selectedFileName.set(file.name);
    this.uploading.set(true);

    this.subscriptionApi.uploadBillingEvidence(file).subscribe({
      next: (uploaded) => {
        this.uploading.set(false);
        this.uploadedEvidence.set(uploaded);
      },
      error: () => {
        this.uploading.set(false);
        this.uploadedEvidence.set(null);
        this.uploadError.set(
          'Unable to upload payment evidence. Use PNG, JPEG, or PDF up to 5MB.',
        );
        input.value = '';
      },
    });
  }

  removeEvidence(event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.uploadedEvidence.set(null);
    this.selectedFileName.set(null);
    this.uploadError.set(null);
  }

  openInspector(record: BillingRecordSummary): void {
    this.selectedRecord.set(record);
    // Lazily fetch the single record detail for inspector completeness without N+1 table reads
    this.loadingDetail.set(true);
    this.subscriptionApi.getBillingRecord(record.id).subscribe({
      next: (detail) => {
        this.selectedRecord.set(detail);
        this.loadingDetail.set(false);
      },
      error: () => {
        // Fallback to list DTO if detail request encounters an issue
        this.loadingDetail.set(false);
      },
    });
  }

  closeInspector(): void {
    this.selectedRecord.set(null);
  }

  downloadEvidence(item: BillingRecordSummary, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
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
    this.formSubmitAttempted.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please complete all required fields correctly.');
      return;
    }

    if (this.submitting() || this.uploading()) {
      return; // prevent double submit
    }

    const plan = this.selectedPlan();
    const evidence = this.uploadedEvidence();

    if (plan === null) {
      this.errorMessage.set('Select an active plan.');
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
      paymentReference: raw.paymentReference.trim(),
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
        this.formSubmitAttempted.set(false);
        this.successMessage.set(
          'Billing evidence submitted for Super Admin review. Subscription will activate or extend upon approval.',
        );
        // Clear local evidence and reset dynamic reference
        this.uploadedEvidence.set(null);
        this.selectedFileName.set(null);
        this.form.controls.paymentReference.reset('');
        this.form.controls.notes.reset('');
        // Reload history using short cache invalidation
        this.reloadHistory();
      },
      error: () => {
        this.submitting.set(false);
        // Preserve entered form values and evidence safely on failure
        this.errorMessage.set(
          'Unable to submit billing evidence. Please check your details and try again.',
        );
      },
    });
  }
}
