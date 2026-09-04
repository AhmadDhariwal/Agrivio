import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  PlatformOrganizationActivationHandoff,
  PlatformOrganizationKpis,
  PlatformOrganizationSummary,
  PlatformOrganizationsApi,
} from '../../data-access/platform-organizations.api';
import { SlicePipe } from '@angular/common';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';

@Component({
  selector: 'agrivio-platform-organizations-page',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    SlicePipe,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiFieldLabelComponent,
    UiPaginationComponent,
  ],
  templateUrl: './organizations-admin.page.html',
  styleUrl: './organizations-admin.page.scss',
})
export class PlatformOrganizationsPage {
  private readonly api = inject(PlatformOrganizationsApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly search$ = new Subject<string>();

  readonly fieldRequired = hasRequiredValidator;

  // Data Signals
  readonly items = signal<PlatformOrganizationSummary[]>([]);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly conflictError = signal<string | null>(null);

  // Server-backed authoritative KPIs
  readonly kpis = signal<PlatformOrganizationKpis>({
    total: 0,
    active: 0,
    suspended: 0,
    trial: 0,
  });
  readonly kpisLoading = signal(true);

  // Pagination & Filter Signals
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly planFilter = signal('');
  readonly subStatusFilter = signal('');

  // Dialog & Modal States
  readonly createOpen = signal(false);
  readonly editOpen = signal(false);
  readonly suspendOpen = signal(false);
  readonly reactivateOpen = signal(false);
  readonly rejectOpen = signal(false);

  readonly selectedItem = signal<PlatformOrganizationSummary | null>(null);
  readonly activationHandoff = signal<PlatformOrganizationActivationHandoff | null>(null);
  readonly copyFeedback = signal<string | null>(null);

  // Forms
  readonly createForm = this.fb.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    ownerEmail: ['', [Validators.required, Validators.email]],
    ownerDisplayName: ['', [Validators.required, Validators.maxLength(200)]],
    timezone: ['Asia/Karachi'],
  });

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

  readonly rejectForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(500)]],
  });

  constructor() {
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => {
        this.search.set(query);
        this.page.set(1);
        this.reload();
      });

    this.reload(true);
    this.reloadKpis(true);
  }

  statusTone(status: string): UiBadgeTone {
    switch (status) {
      case 'approved':
      case 'active':
        return 'success';
      case 'pending_approval':
        return 'warning';
      case 'suspended':
      case 'rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  statusLabel(status: string): string {
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
        return status ? status.replace(/_/g, ' ') : 'Unknown';
    }
  }

  reload(forceRefresh = false): void {
    if (this.loading()) {
      // initial load
    } else {
      this.refreshing.set(true);
    }
    this.errorMessage.set(null);
    this.conflictError.set(null);

    const query = {
      page: this.page(),
      pageSize: this.pageSize(),
      ...(this.statusFilter() ? { status: this.statusFilter() } : {}),
      ...(this.planFilter() ? { plan: this.planFilter() } : {}),
      ...(this.subStatusFilter() ? { subscriptionStatus: this.subStatusFilter() } : {}),
      ...(this.search().trim() ? { search: this.search().trim() } : {}),
    };

    this.api.list(query, forceRefresh).subscribe({
      next: ({ items, meta }) => {
        this.items.set(items);
        this.total.set(meta.total);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
        this.errorMessage.set('Unable to load organizations. Please try again.');
      },
    });
  }

  reloadKpis(forceRefresh = false): void {
    this.kpisLoading.set(true);
    this.api.getSummaryKpis(forceRefresh).subscribe({
      next: (kpis) => {
        this.kpis.set(kpis);
        this.kpisLoading.set(false);
      },
      error: () => {
        this.kpisLoading.set(false);
      },
    });
  }

  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.search$.next(input.value);
  }

  onStatusFilterChange(status: string): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.reload();
  }

  onPlanFilterChange(plan: string): void {
    this.planFilter.set(plan);
    this.page.set(1);
    this.reload();
  }

  onSubStatusFilterChange(subStatus: string): void {
    this.subStatusFilter.set(subStatus);
    this.page.set(1);
    this.reload();
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.planFilter.set('');
    this.subStatusFilter.set('');
    this.page.set(1);
    this.reload();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.reload();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.reload();
  }

  // Create Organization
  openCreate(): void {
    this.createForm.reset({
      organizationName: '',
      ownerEmail: '',
      ownerDisplayName: '',
      timezone: 'Asia/Karachi',
    });
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  submitCreate(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const input = this.createForm.getRawValue();
    this.api.create(input).subscribe({
      next: (result) => {
        this.createOpen.set(false);
        this.successMessage.set(
          result.duplicate
            ? `Organization already exists (${result.status}).`
            : `Organization ${input.organizationName} created successfully in ${result.status} state.`,
        );
        this.reload(true);
        this.reloadKpis(true);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message ?? 'Failed to create organization.');
      },
    });
  }

  // Edit Organization
  openEdit(item: PlatformOrganizationSummary): void {
    this.selectedItem.set(item);
    this.conflictError.set(null);
    this.editForm.reset({
      name: item.name,
      timezone: item.timezone ?? 'Asia/Karachi',
      reason: '',
    });
    this.editOpen.set(true);
  }

  closeEdit(): void {
    this.editOpen.set(false);
    this.selectedItem.set(null);
  }

  submitEdit(): void {
    const item = this.selectedItem();
    if (!item) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const values = this.editForm.getRawValue();
    this.api
      .update(item.id, {
        expectedVersion: item.version ?? 1,
        reason: values.reason,
        name: values.name,
        timezone: values.timezone,
      })
      .subscribe({
        next: (updated) => {
          this.editOpen.set(false);
          this.selectedItem.set(null);
          this.successMessage.set(`Organization profile updated for ${updated.name}.`);
          this.reload(true);
        },
        error: (err) => {
          if (err?.status === 409) {
            this.conflictError.set(
              'Version conflict: This organization was updated by another administrator. Please reload to see the latest version before modifying.',
            );
          } else {
            this.errorMessage.set(err?.error?.message ?? 'Update failed.');
          }
        },
      });
  }

  // Suspend Organization
  openSuspend(item: PlatformOrganizationSummary): void {
    this.selectedItem.set(item);
    this.conflictError.set(null);
    this.suspendForm.reset({ reason: '', confirmed: false });
    this.suspendOpen.set(true);
  }

  closeSuspend(): void {
    this.suspendOpen.set(false);
    this.selectedItem.set(null);
  }

  submitSuspend(): void {
    const item = this.selectedItem();
    if (!item) return;
    if (this.suspendForm.invalid) {
      this.suspendForm.markAllAsTouched();
      return;
    }
    const values = this.suspendForm.getRawValue();
    this.api
      .suspend(item.id, {
        expectedVersion: item.version ?? 1,
        reason: values.reason,
        confirmed: true,
      })
      .subscribe({
        next: () => {
          this.suspendOpen.set(false);
          this.selectedItem.set(null);
          this.successMessage.set(
            `Organization ${item.name} suspended. Tenant access is now restricted according to platform policy. Organization data is preserved.`,
          );
          this.reload(true);
          this.reloadKpis(true);
        },
        error: (err) => {
          if (err?.status === 409) {
            this.conflictError.set(
              'Version conflict: This organization state was modified concurrently. Please reload before retrying.',
            );
          } else {
            this.errorMessage.set(err?.error?.message ?? 'Suspension failed.');
          }
        },
      });
  }

  // Reactivate Organization
  openReactivate(item: PlatformOrganizationSummary): void {
    this.selectedItem.set(item);
    this.conflictError.set(null);
    this.reactivateForm.reset({ reason: '' });
    this.reactivateOpen.set(true);
  }

  closeReactivate(): void {
    this.reactivateOpen.set(false);
    this.selectedItem.set(null);
  }

  submitReactivate(): void {
    const item = this.selectedItem();
    if (!item) return;
    if (this.reactivateForm.invalid) {
      this.reactivateForm.markAllAsTouched();
      return;
    }
    const values = this.reactivateForm.getRawValue();
    this.api
      .reactivate(item.id, {
        expectedVersion: item.version ?? 1,
        reason: values.reason,
      })
      .subscribe({
        next: () => {
          this.reactivateOpen.set(false);
          this.selectedItem.set(null);
          this.successMessage.set(
            `Organization ${item.name} reactivated. Normal operational access restored according to its subscription and RBAC policies.`,
          );
          this.reload(true);
          this.reloadKpis(true);
        },
        error: (err) => {
          if (err?.status === 409) {
            this.conflictError.set(
              'Version conflict: This organization state was modified concurrently. Please reload before retrying.',
            );
          } else {
            this.errorMessage.set(err?.error?.message ?? 'Reactivation failed.');
          }
        },
      });
  }

  // Onboarding Actions
  askApprove(item: PlatformOrganizationSummary): void {
    this.api.approve(item.id).subscribe({
      next: (result) => {
        this.successMessage.set(
          `Approved ${item.name}. One-time Owner activation link generated for manual delivery.`,
        );
        this.activationHandoff.set(result);
        this.reload(true);
        this.reloadKpis(true);
      },
      error: (err) => this.errorMessage.set(err?.error?.message ?? 'Approve failed.'),
    });
  }

  openReject(item: PlatformOrganizationSummary): void {
    this.selectedItem.set(item);
    this.rejectForm.reset({ reason: '' });
    this.rejectOpen.set(true);
  }

  closeReject(): void {
    this.rejectOpen.set(false);
    this.selectedItem.set(null);
  }

  submitReject(): void {
    const item = this.selectedItem();
    if (!item) return;
    if (this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
      return;
    }
    const reason = this.rejectForm.getRawValue().reason;
    this.api.reject(item.id, reason).subscribe({
      next: () => {
        this.rejectOpen.set(false);
        this.selectedItem.set(null);
        this.successMessage.set(`Organization request ${item.name} has been rejected.`);
        this.reload(true);
        this.reloadKpis(true);
      },
      error: (err) => this.errorMessage.set(err?.error?.message ?? 'Reject failed.'),
    });
  }

  askReissue(item: PlatformOrganizationSummary): void {
    this.api.reissueActivation(item.id).subscribe({
      next: (result) => {
        this.successMessage.set(`New activation link reissued for ${item.name}.`);
        this.activationHandoff.set(result);
        this.reload(true);
      },
      error: (err) =>
        this.errorMessage.set(
          err?.error?.message ?? 'Reissue failed. Owner may already have activated their credentials.',
        ),
    });
  }

  async copyActivationUrl(): Promise<void> {
    const handoff = this.activationHandoff();
    if (!handoff) return;
    try {
      await navigator.clipboard.writeText(handoff.activationUrl);
      this.copyFeedback.set('Activation link copied to clipboard.');
    } catch {
      this.copyFeedback.set('Copy failed. Select and copy the link manually.');
    }
  }
}
