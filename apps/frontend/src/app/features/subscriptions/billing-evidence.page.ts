import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SubscriptionApi, BillingSubmitPayload } from './subscription.api';
import { SubscriptionStatusBannerComponent } from './subscription-status-banner.component';
import { AuthSessionStore } from '../auth/auth-session.store';
import { SubscriptionAccessState } from './subscription-access.util';

@Component({
  selector: 'agrivio-billing-evidence-page',
  standalone: true,
  imports: [ReactiveFormsModule, SubscriptionStatusBannerComponent],
  templateUrl: './billing-evidence.page.html',
  styleUrl: './billing-evidence.page.scss',
})
export class BillingEvidencePage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly submitting = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
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
        },
        error: () => {
          this.submitting.set(false);
          this.errorMessage.set('Unable to submit billing evidence.');
        },
      });
  }
}
