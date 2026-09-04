import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import {
  PlatformChangePlanPayload,
  PlatformOrganizationDetail,
  PlatformOrganizationsApi,
  PlatformProfilePatchPayload,
  PlatformReactivatePayload,
  PlatformResourceUsageThreshold,
  PlatformSuspendPayload,
  ResourcePresentationState,
} from '../../data-access/platform-organizations.api';
import {
  SubscriptionApi,
  SubscriptionPlanSummary,
} from '../../../subscriptions/data-access/subscription.api';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-platform-organization-detail-page',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    SlicePipe,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './organization-detail.page.html',
  styleUrl: './organization-detail.page.scss',
})
export class PlatformOrganizationDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(PlatformOrganizationsApi);
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly fb = inject(FormBuilder);

  readonly organizationId = signal<string>('');
  readonly detail = signal<PlatformOrganizationDetail | null>(null);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly conflictError = signal<string | null>(null);
  readonly accessDenied = signal(false);
  readonly notFound = signal(false);

  // Available plans for subscription change
  readonly availablePlans = signal<SubscriptionPlanSummary[]>([]);
  readonly loadingPlans = signal(false);

  // Modals & Dialogs
  readonly editOpen = signal(false);
  readonly suspendOpen = signal(false);
  readonly reactivateOpen = signal(false);
  readonly changePlanOpen = signal(false);

  // Forms
  readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    timezone: ['Asia/Karachi', [Validators.required]],
    reason: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(500)]],
  });

  readonly suspendForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(500)]],
    confirmed: [false, [Validators.requiredTrue]],
  });

  readonly reactivateForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(500)]],
  });

  readonly changePlanForm = this.fb.nonNullable.group({
    planSelection: ['', [Validators.required]],
    reason: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(500)]],
    effective: ['immediate' as 'immediate' | 'next_period'],
  });

  // Computed Properties
  readonly isSuspended = computed(() => this.detail()?.status === 'suspended');
  readonly isApproved = computed(() => this.detail()?.status === 'approved');
  readonly isPending = computed(() => this.detail()?.status === 'pending_approval');

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.organizationId.set(id);
      this.loadDetail(true);
    } else {
      this.notFound.set(true);
      this.loading.set(false);
    }
  }

  statusTone(status?: string): UiBadgeTone {
    switch (status) {
      case 'approved':
      case 'active':
        return 'success';
      case 'trial':
      case 'pending_approval':
      case 'grace':
        return 'warning';
      case 'suspended':
      case 'rejected':
      case 'cancelled':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  statusLabel(status?: string): string {
    if (!status) return 'Unknown';
    switch (status) {
      case 'approved':
        return 'Active';
      case 'pending_approval':
        return 'Pending Approval';
      case 'suspended':
        return 'Suspended';
      case 'rejected':
        return 'Rejected';
      default:
        return status.replace(/_/g, ' ');
    }
  }

  getUsageState(threshold?: PlatformResourceUsageThreshold): ResourcePresentationState {
    if (!threshold || threshold.limit === null || threshold.limit <= 0) {
      return 'normal';
    }
    const ratio = threshold.current / threshold.limit;
    if (ratio >= 1) return 'limit-reached';
    if (ratio >= 0.8) return 'near-limit';
    return 'normal';
  }

  getUsagePercentage(threshold?: PlatformResourceUsageThreshold): number {
    if (!threshold || threshold.limit === null || threshold.limit <= 0) return 0;
    return Math.min(100, Math.round((threshold.current / threshold.limit) * 100));
  }

  getUsageTone(state: ResourcePresentationState): 'danger' | 'warning' | 'neutral' | 'success' {
    switch (state) {
      case 'limit-reached':
        return 'danger';
      case 'near-limit':
        return 'warning';
      default:
        return 'success';
    }
  }

  loadDetail(forceRefresh = false): void {
    const id = this.organizationId();
    if (!id) return;

    if (this.detail()) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }

    this.errorMessage.set(null);
    this.conflictError.set(null);

    this.api.getById(id, forceRefresh).subscribe({
      next: (data) => {
        this.detail.set(data);
        this.loading.set(false);
        this.refreshing.set(false);
        this.notFound.set(false);
        this.accessDenied.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.refreshing.set(false);
        if (err?.status === 401) {
          this.router.navigate(['/login']);
        } else if (err?.status === 403) {
          this.accessDenied.set(true);
        } else if (err?.status === 404) {
          this.notFound.set(true);
        } else {
          // Preserve last valid data on refresh failure
          this.errorMessage.set('Failed to refresh organization details. Displaying last valid data.');
        }
      },
    });
  }

  // Edit Organization
  openEdit(): void {
    const org = this.detail();
    if (!org) return;
    this.conflictError.set(null);
    this.editForm.reset({
      name: org.name,
      timezone: org.timezone ?? 'Asia/Karachi',
      reason: '',
    });
    this.editOpen.set(true);
  }

  closeEdit(): void {
    this.editOpen.set(false);
  }

  submitEdit(): void {
    const org = this.detail();
    if (!org) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const val = this.editForm.getRawValue();
    const payload: PlatformProfilePatchPayload = {
      expectedVersion: org.version ?? 1,
      name: val.name,
      timezone: val.timezone,
      reason: val.reason,
    };

    this.api.update(org.id, payload).subscribe({
      next: (res) => {
        this.editOpen.set(false);
        this.successMessage.set(`Organization profile updated for ${res.name}.`);
        this.loadDetail(true);
      },
      error: (err) => {
        if (err?.status === 409) {
          this.conflictError.set(
            'Version conflict: This organization was updated concurrently by another administrator. Please reload before saving.',
          );
        } else {
          this.errorMessage.set(err?.error?.message ?? 'Failed to update organization profile.');
        }
      },
    });
  }

  // Suspend Organization
  openSuspend(): void {
    this.conflictError.set(null);
    this.suspendForm.reset({ reason: '', confirmed: false });
    this.suspendOpen.set(true);
  }

  closeSuspend(): void {
    this.suspendOpen.set(false);
  }

  submitSuspend(): void {
    const org = this.detail();
    if (!org) return;
    if (this.suspendForm.invalid) {
      this.suspendForm.markAllAsTouched();
      return;
    }
    const val = this.suspendForm.getRawValue();
    const payload: PlatformSuspendPayload = {
      expectedVersion: org.version ?? 1,
      reason: val.reason,
      confirmed: true,
    };

    this.api.suspend(org.id, payload).subscribe({
      next: () => {
        this.suspendOpen.set(false);
        this.successMessage.set(
          `Organization ${org.name} suspended. Tenant operational access is restricted according to platform policy. Organization data is preserved.`,
        );
        this.loadDetail(true);
      },
      error: (err) => {
        if (err?.status === 409) {
          this.conflictError.set(
            'Version conflict: The organization state changed during suspension. Please reload to review current state.',
          );
        } else {
          this.errorMessage.set(err?.error?.message ?? 'Failed to suspend organization.');
        }
      },
    });
  }

  // Reactivate Organization
  openReactivate(): void {
    this.conflictError.set(null);
    this.reactivateForm.reset({ reason: '' });
    this.reactivateOpen.set(true);
  }

  closeReactivate(): void {
    this.reactivateOpen.set(false);
  }

  submitReactivate(): void {
    const org = this.detail();
    if (!org) return;
    if (this.reactivateForm.invalid) {
      this.reactivateForm.markAllAsTouched();
      return;
    }
    const val = this.reactivateForm.getRawValue();
    const payload: PlatformReactivatePayload = {
      expectedVersion: org.version ?? 1,
      reason: val.reason,
    };

    this.api.reactivate(org.id, payload).subscribe({
      next: () => {
        this.reactivateOpen.set(false);
        this.successMessage.set(
          `Organization ${org.name} reactivated. Normal operational access restored according to its subscription and RBAC policies.`,
        );
        this.loadDetail(true);
      },
      error: (err) => {
        if (err?.status === 409) {
          this.conflictError.set(
            'Version conflict: The organization state changed during reactivation. Please reload to review current state.',
          );
        } else {
          this.errorMessage.set(err?.error?.message ?? 'Failed to reactivate organization.');
        }
      },
    });
  }

  // Subscription Plan Change
  openChangePlan(): void {
    this.conflictError.set(null);
    this.changePlanForm.reset({
      planSelection: '',
      reason: '',
      effective: 'immediate',
    });
    this.loadingPlans.set(true);
    this.changePlanOpen.set(true);

    this.subscriptionApi.listPlatformPlans().subscribe({
      next: (plans) => {
        this.availablePlans.set(plans.filter((p) => p.status === 'active' || p.status === 'superseded'));
        this.loadingPlans.set(false);
      },
      error: () => {
        this.loadingPlans.set(false);
        this.errorMessage.set('Unable to fetch subscription plans for assignment.');
      },
    });
  }

  closeChangePlan(): void {
    this.changePlanOpen.set(false);
  }

  submitChangePlan(): void {
    const org = this.detail();
    const sub = org?.subscription;
    if (!org || !sub) return;
    if (this.changePlanForm.invalid) {
      this.changePlanForm.markAllAsTouched();
      return;
    }

    const val = this.changePlanForm.getRawValue();
    // planSelection is formatted as "code:version"
    const [code, versionStr] = val.planSelection.split(':');
    const version = Number(versionStr ?? 1);

    const payload: PlatformChangePlanPayload = {
      expectedVersion: sub.version ?? 1,
      planCode: code ?? 'Starter',
      planVersion: version,
      reason: val.reason,
      effective: val.effective,
    };

    this.api.changeSubscriptionPlan(sub.id, payload, org.id).subscribe({
      next: () => {
        this.changePlanOpen.set(false);
        this.successMessage.set(`Subscription plan successfully updated to ${code} (v${version}).`);
        this.loadDetail(true);
      },
      error: (err) => {
        if (err?.status === 409) {
          this.conflictError.set(
            'Version conflict: Subscription was modified concurrently. Please reload before retrying plan change.',
          );
        } else {
          this.errorMessage.set(err?.error?.message ?? 'Plan change failed.');
        }
      },
    });
  }

  formatCanonicalAction(action: string): string {
    if (!action) return '—';
    return action
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
