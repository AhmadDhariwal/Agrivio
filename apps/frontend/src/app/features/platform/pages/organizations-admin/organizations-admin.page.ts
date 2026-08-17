import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  PlatformOrganizationActivationHandoff,
  PlatformOrganizationSummary,
  PlatformOrganizationsApi,
} from '../../data-access/platform-organizations.api';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';

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
    UiFieldLabelComponent,
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
  readonly activationHandoff = signal<PlatformOrganizationActivationHandoff | null>(null);
  readonly copyFeedback = signal<string | null>(null);

  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('Confirm action');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Confirm');
  readonly confirmDanger = signal(false);
  private pendingAction: (() => void) | null = null;

  readonly rejectForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3)]],
  });

  readonly fieldRequired = hasRequiredValidator;

  readonly createForm = this.formBuilder.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    ownerEmail: ['', [Validators.required, Validators.email]],
    ownerDisplayName: ['', [Validators.required, Validators.maxLength(200)]],
    timezone: ['Asia/Karachi'],
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

  createOrganization(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      this.errorMessage.set('Organization name, owner email, and owner display name are required.');
      return;
    }
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const input = this.createForm.getRawValue();
    this.api.create(input).subscribe({
      next: (result) => {
        this.successMessage.set(
          result.duplicate
            ? `Organization already exists (${result.status}).`
            : `Created ${input.organizationName} in ${result.status}. Owner still needs approval and activation.`,
        );
        this.createForm.reset({
          organizationName: '',
          ownerEmail: '',
          ownerDisplayName: '',
          timezone: 'Asia/Karachi',
        });
        this.reload();
      },
      error: () => this.errorMessage.set('Create organization failed.'),
    });
  }

  askApprove(item: PlatformOrganizationSummary): void {
    this.confirmTitle.set(`Approve ${item.name}?`);
    this.confirmMessage.set(
      'This grants organization approval and issues a one-time Owner activation link. The plaintext token is shown once for manual delivery.',
    );
    this.confirmLabel.set('Approve organization');
    this.confirmDanger.set(false);
    this.pendingAction = () => this.approve(item);
    this.confirmOpen.set(true);
  }

  askReissue(item: PlatformOrganizationSummary): void {
    this.confirmTitle.set(`Reissue activation for ${item.name}?`);
    this.confirmMessage.set(
      'This invalidates any unused Owner activation token and issues a new one-time link. Use only when the Owner has not set a password yet.',
    );
    this.confirmLabel.set('Reissue activation link');
    this.confirmDanger.set(false);
    this.pendingAction = () => this.reissue(item);
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
    this.activationHandoff.set(null);
    this.copyFeedback.set(null);
    this.api.approve(item.id).subscribe({
      next: (result) => {
        this.successMessage.set(`Approved ${item.name}. Deliver the activation link to the Owner.`);
        this.activationHandoff.set(this.withBrowserOriginFallback(result));
        this.reload();
      },
      error: () => this.errorMessage.set('Approve failed.'),
    });
  }

  reissue(item: PlatformOrganizationSummary): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.activationHandoff.set(null);
    this.copyFeedback.set(null);
    this.api.reissueActivation(item.id).subscribe({
      next: (result) => {
        this.successMessage.set(
          `Reissued activation for ${item.name}. Deliver the new one-time link to the Owner.`,
        );
        this.activationHandoff.set(this.withBrowserOriginFallback(result));
        this.reload();
      },
      error: () =>
        this.errorMessage.set(
          'Reissue failed. The Owner may already be activated, or the organization is not eligible.',
        ),
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

  async copyActivationUrl(): Promise<void> {
    const handoff = this.activationHandoff();
    if (handoff === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(handoff.activationUrl);
      this.copyFeedback.set('Activation link copied.');
    } catch {
      this.copyFeedback.set('Copy failed. Select and copy the link manually.');
    }
  }

  private withBrowserOriginFallback(
    result: PlatformOrganizationActivationHandoff,
  ): PlatformOrganizationActivationHandoff {
    if (result.activationUrl.startsWith('http://') || result.activationUrl.startsWith('https://')) {
      return result;
    }
    return {
      ...result,
      activationUrl: `${window.location.origin}${result.activationPath}`,
    };
  }
}
