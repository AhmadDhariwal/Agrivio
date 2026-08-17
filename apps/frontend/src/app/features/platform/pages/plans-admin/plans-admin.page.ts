import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SubscriptionApi, SubscriptionPlanSummary } from '../../../subscriptions/data-access/subscription.api';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-platform-plans-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './plans-admin.page.html',
  styleUrl: './plans-admin.page.scss',
})
export class PlatformPlansPage {
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly formBuilder = inject(FormBuilder);

  readonly plans = signal<SubscriptionPlanSummary[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly fieldRequired = hasRequiredValidator;

  readonly form = this.formBuilder.nonNullable.group({
    planCode: ['Starter', Validators.required],
    activate: [true],
    monthlyPriceMinorUnits: [null as number | null],
    annualPriceMinorUnits: [null as number | null],
    annualDiscountPercent: [null as number | null],
  });

  constructor() {
    this.reload();
  }

  statusTone(status: string): UiBadgeTone {
    return status === 'active' ? 'success' : 'neutral';
  }

  reload(): void {
    this.loading.set(true);
    this.subscriptionApi.listPlatformPlans().subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load plans.');
      },
    });
  }

  createVersion(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.submitting.set(true);
    this.subscriptionApi
      .createPlatformPlan({
        planCode: raw.planCode,
        activate: raw.activate,
        monthlyPriceMinorUnits: raw.monthlyPriceMinorUnits,
        annualPriceMinorUnits: raw.annualPriceMinorUnits,
        annualDiscountPercent: raw.annualDiscountPercent,
      })
      .subscribe({
        next: (plan) => {
          this.submitting.set(false);
          this.successMessage.set(`Created ${plan.planCode} v${plan.planVersion}`);
          this.reload();
        },
        error: () => {
          this.submitting.set(false);
          this.errorMessage.set('Unable to create plan version.');
        },
      });
  }
}
