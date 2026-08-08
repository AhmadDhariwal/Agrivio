import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SubscriptionApi, SubscriptionPlanSummary } from '../subscriptions/subscription.api';

@Component({
  selector: 'agrivio-platform-plans-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './plans-admin.page.html',
  styleUrl: './plans-admin.page.scss',
})
export class PlatformPlansPage {
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly formBuilder = inject(FormBuilder);

  readonly plans = signal<SubscriptionPlanSummary[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

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

  reload(): void {
    this.subscriptionApi.listPlatformPlans().subscribe({
      next: (plans) => this.plans.set(plans),
      error: () => this.errorMessage.set('Unable to load plans.'),
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
          this.successMessage.set(`Created ${plan.planCode} v${plan.planVersion}`);
          this.reload();
        },
        error: () => this.errorMessage.set('Unable to create plan version.'),
      });
  }
}
