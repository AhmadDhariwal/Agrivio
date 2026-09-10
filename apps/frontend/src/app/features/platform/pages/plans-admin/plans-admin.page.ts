import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  SubscriptionApi,
  SubscriptionPlanSummary,
} from '../../../subscriptions/data-access/subscription.api';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiStatusBadgeComponent,
  UiBadgeTone,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-platform-plans-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiAlertComponent,
    UiConfirmDialogComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './plans-admin.page.html',
  styleUrl: './plans-admin.page.scss',
})
export class PlatformPlansPage {
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly formBuilder = inject(FormBuilder);

  readonly plans = signal<SubscriptionPlanSummary[]>([]);
  readonly inspectedPlan = signal<SubscriptionPlanSummary | null>(null);
  readonly editorOpen = signal(false);
  readonly editingDraft = signal(false);
  readonly targetPlan = signal<SubscriptionPlanSummary | null>(null);

  readonly retireConfirmOpen = signal(false);
  readonly retiringPlan = signal<SubscriptionPlanSummary | null>(null);
  readonly retireErrorMessage = signal<string | null>(null);
  readonly retiringInFlight = signal(false);

  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly retireDialogMessage = computed(() => {
    const plan = this.retiringPlan();
    if (!plan) return '';
    let msg = `Retiring ${plan.displayName} v${plan.planVersion} will make it no longer selectable for new subscriptions. Existing pinned subscriptions remain unaffected.`;
    if (this.retireErrorMessage()) {
      msg += `\n\nError: ${this.retireErrorMessage()}`;
    }
    return msg;
  });

  readonly retireConfirmLabel = computed(() => {
    return this.retiringInFlight() ? 'Retiring plan…' : 'Retire plan';
  });

  readonly form = this.formBuilder.nonNullable.group({
    planCode: ['Starter', Validators.required],
    displayName: ['', Validators.required],
    shortDescription: ['', Validators.required],
    targetCustomer: ['', Validators.required],
    catalogRevision: ['', Validators.required],
    currency: ['PKR', Validators.required],
    monthlyPriceMinorUnits: [null as number | null],
    annualPriceMinorUnits: [null as number | null],
    trialEligible: [true],
    products: [null as number | null],
    activeUsers: [null as number | null],
    branches: [null as number | null],
    warehouses: [null as number | null],
    customers: [null as number | null],
    suppliers: [null as number | null],
    imports: [false],
    reportsExports: [false],
    auditHistory: ['', Validators.required],
    backupPolicyRef: ['', Validators.required],
    dedicatedCloudEligible: [false],
    supportLevelRef: ['', Validators.required],
  });

  constructor() {
    this.reload();
  }

  statusTone(status: string): UiBadgeTone {
    return status === 'active' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
  }

  formatPrice(value: number | null): string {
    return value === null
      ? 'Not configured'
      : new Intl.NumberFormat('en-PK', {
          style: 'currency',
          currency: 'PKR',
          maximumFractionDigits: 0,
        }).format(value / 100);
  }

  formatLimit(value: number | null | undefined, singular: string, plural: string): string {
    if (value === null || value === undefined) return 'Not configured';
    return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
  }

  reload(): void {
    this.loading.set(true);
    this.subscriptionApi.listPlatformPlans(true).subscribe({
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

  inspect(plan: SubscriptionPlanSummary, event?: Event): void {
    event?.stopPropagation();
    this.closeEditor();
    this.cancelRetire();
    this.inspectedPlan.set(plan);
  }

  closeInspector(): void {
    this.inspectedPlan.set(null);
  }

  createFrom(plan?: SubscriptionPlanSummary, event?: Event): void {
    event?.stopPropagation();
    this.closeInspector();
    this.cancelRetire();
    this.editingDraft.set(false);
    this.targetPlan.set(plan ?? null);
    if (plan) {
      this.populateForm(plan);
    } else {
      this.resetForm();
    }
    this.editorOpen.set(true);
  }

  editDraft(plan: SubscriptionPlanSummary, event?: Event): void {
    event?.stopPropagation();
    if (plan.status !== 'draft' || plan.referenced) return;
    this.closeInspector();
    this.cancelRetire();
    this.editingDraft.set(true);
    this.targetPlan.set(plan);
    this.populateForm(plan);
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    this.editorOpen.set(false);
    this.targetPlan.set(null);
    this.editingDraft.set(false);
    this.resetForm();
    this.clearMessages();
  }

  saveDraft(): void {
    this.submit(false);
  }

  createAndActivate(): void {
    this.submit(true);
  }

  activate(plan: SubscriptionPlanSummary, event?: Event): void {
    event?.stopPropagation();
    this.runMutation(
      this.subscriptionApi.activatePlatformPlan(plan),
      `Activated ${plan.planCode} v${plan.planVersion}`,
    );
  }

  retire(plan: SubscriptionPlanSummary, event?: Event): void {
    event?.stopPropagation();
    this.closeInspector();
    this.closeEditor();
    this.retiringPlan.set(plan);
    this.retireErrorMessage.set(null);
    this.retiringInFlight.set(false);
    this.retireConfirmOpen.set(true);
  }

  cancelRetire(): void {
    this.retireConfirmOpen.set(false);
    this.retiringPlan.set(null);
    this.retireErrorMessage.set(null);
    this.retiringInFlight.set(false);
  }

  confirmRetire(rawReason: string): void {
    const reason = rawReason?.trim();
    if (!reason || this.retiringInFlight()) return;

    const plan = this.retiringPlan();
    if (!plan) return;

    this.retiringInFlight.set(true);
    this.retireErrorMessage.set(null);

    this.subscriptionApi.retirePlatformPlan(plan, reason).subscribe({
      next: () => {
        this.retiringInFlight.set(false);
        this.retireConfirmOpen.set(false);
        this.retiringPlan.set(null);
        this.closeInspector();
        this.successMessage.set(`Retired ${plan.planCode} v${plan.planVersion}`);
        this.reload();
      },
      error: (error) => {
        this.retiringInFlight.set(false);
        const msg = error?.error?.message ?? 'Unable to retire plan.';
        this.retireErrorMessage.set(msg);
      },
    });
  }

  private submit(activate: boolean): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload = {
      planCode: raw.planCode,
      displayName: raw.displayName,
      shortDescription: raw.shortDescription,
      targetCustomer: raw.targetCustomer,
      catalogRevision: raw.catalogRevision,
      currency: raw.currency,
      monthlyPriceMinorUnits: raw.monthlyPriceMinorUnits,
      annualPriceMinorUnits: raw.annualPriceMinorUnits,
      annualDiscountPercent: null,
      trialEligible: raw.trialEligible,
      limits: {
        products: raw.products,
        activeUsers: raw.activeUsers,
        branches: raw.branches,
        warehouses: raw.warehouses,
        customers: raw.customers,
        suppliers: raw.suppliers,
      },
      entitlements: {
        imports: raw.imports,
        reportsExports: raw.reportsExports,
        auditHistory: raw.auditHistory,
        backupPolicyRef: raw.backupPolicyRef,
        dedicatedCloudEligible: raw.dedicatedCloudEligible,
        supportLevelRef: raw.supportLevelRef,
      },
    };

    this.submitting.set(true);
    const target = this.targetPlan();
    const isEditingDraft = this.editingDraft();
    const successMsg =
      isEditingDraft && target
        ? `Updated ${target.planCode} v${target.planVersion}`
        : `Created ${raw.planCode} plan version`;

    const request =
      isEditingDraft && target
        ? this.subscriptionApi.updatePlatformPlan(target, {
            ...payload,
            expectedVersion: target.version ?? 1,
          })
        : this.subscriptionApi.createPlatformPlan({ ...payload, activate });

    request.subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeEditor();
        this.successMessage.set(successMsg);
        this.reload();
      },
      error: (error) => {
        this.submitting.set(false);
        this.errorMessage.set(error?.error?.message ?? 'Unable to update plan.');
      },
    });
  }

  private resetForm(): void {
    this.form.reset({
      planCode: 'Starter',
      displayName: '',
      shortDescription: '',
      targetCustomer: '',
      catalogRevision: '',
      currency: 'PKR',
      monthlyPriceMinorUnits: null,
      annualPriceMinorUnits: null,
      trialEligible: true,
      products: null,
      activeUsers: null,
      branches: null,
      warehouses: null,
      customers: null,
      suppliers: null,
      imports: false,
      reportsExports: false,
      auditHistory: '',
      backupPolicyRef: '',
      dedicatedCloudEligible: false,
      supportLevelRef: '',
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private populateForm(plan: SubscriptionPlanSummary): void {
    this.resetForm();
    this.form.setValue({
      planCode: plan.planCode,
      displayName: plan.displayName ?? plan.planCode,
      shortDescription: plan.shortDescription ?? '',
      targetCustomer: plan.targetCustomer ?? '',
      catalogRevision: plan.catalogRevision ?? '',
      currency: plan.currency,
      monthlyPriceMinorUnits: plan.monthlyPriceMinorUnits,
      annualPriceMinorUnits: plan.annualPriceMinorUnits,
      trialEligible: plan.trialEligible !== false,
      products: plan.limits['products'] ?? null,
      activeUsers: plan.limits['activeUsers'] ?? null,
      branches: plan.limits['branches'] ?? null,
      warehouses: plan.limits['warehouses'] ?? null,
      customers: plan.limits['customers'] ?? null,
      suppliers: plan.limits['suppliers'] ?? null,
      imports: plan.entitlements['imports'] === true,
      reportsExports: plan.entitlements['reportsExports'] === true,
      auditHistory: String(plan.entitlements['auditHistory'] ?? ''),
      backupPolicyRef: String(plan.entitlements['backupPolicyRef'] ?? ''),
      dedicatedCloudEligible: plan.entitlements['dedicatedCloudEligible'] === true,
      supportLevelRef: String(plan.entitlements['supportLevelRef'] ?? ''),
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private runMutation(
    request: ReturnType<SubscriptionApi['createPlatformPlan']>,
    success: string,
  ): void {
    this.clearMessages();
    this.submitting.set(true);
    request.subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeEditor();
        this.closeInspector();
        this.successMessage.set(success);
        this.reload();
      },
      error: (error) => {
        this.submitting.set(false);
        this.errorMessage.set(error?.error?.message ?? 'Unable to update plan.');
      },
    });
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }
}
