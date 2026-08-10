import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  PlatformOrganizationSummary,
  PlatformOrganizationsApi,
} from './platform-organizations.api';
import { UiPageHeaderComponent } from '../../shared/ui/ui-page-header.component';
import { UiAlertComponent } from '../../shared/ui/ui-alert.component';
import { UiEmptyStateComponent } from '../../shared/ui/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../shared/ui/ui-loading-state.component';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../shared/ui/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../shared/ui/ui-confirm-dialog.component';

@Component({
  selector: 'agrivio-platform-organizations-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiConfirmDialogComponent,
  ],
  templateUrl: './organizations-admin.page.html',
  styleUrl: './organizations-admin.page.scss',
})
export class PlatformOrganizationsPage {
  private readonly api = inject(PlatformOrganizationsApi);
  private readonly formBuilder = inject(FormBuilder);

  readonly items = signal<PlatformOrganizationSummary[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly activationToken = signal<string | null>(null);

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
      case 'active':
        return 'success';
      case 'pending_approval':
        return 'warning';
      case 'rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load organizations.');
      },
    });
  }

  askApprove(item: PlatformOrganizationSummary): void {
    this.confirmTitle.set(`Approve ${item.name}?`);
    this.confirmMessage.set(
      'This grants organization approval and issues a one-time Owner activation token.',
    );
    this.confirmLabel.set('Approve organization');
    this.confirmDanger.set(false);
    this.pendingAction = () => this.approve(item);
    this.confirmOpen.set(true);
  }

  askReject(item: PlatformOrganizationSummary): void {
    if (this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
      this.errorMessage.set('Rejection reason is required.');
      return;
    }
    this.confirmTitle.set(`Reject ${item.name}?`);
    this.confirmMessage.set('This rejects the organization activation request.');
    this.confirmLabel.set('Reject organization');
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

  approve(item: PlatformOrganizationSummary): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.activationToken.set(null);
    this.api.approve(item.id).subscribe({
      next: (result) => {
        this.successMessage.set(`Approved ${item.name}`);
        this.activationToken.set(result.activationToken);
        this.reload();
      },
      error: () => this.errorMessage.set('Approve failed.'),
    });
  }

  reject(item: PlatformOrganizationSummary): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    if (this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
      this.errorMessage.set('Rejection reason is required.');
      return;
    }
    this.api.reject(item.id, this.rejectForm.getRawValue().reason).subscribe({
      next: () => {
        this.successMessage.set(`Rejected ${item.name}`);
        this.reload();
      },
      error: () => this.errorMessage.set('Reject failed.'),
    });
  }
}
