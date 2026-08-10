import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import {
  OrganizationProfile,
  OrganizationSettings,
  OrganizationSettingsApi,
} from '../../data-access/organization-settings.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-organization-settings-page',
  standalone: true,
  imports: [ReactiveFormsModule, UiPageHeaderComponent, UiAlertComponent, UiLoadingStateComponent],
  templateUrl: './organization-settings.page.html',
  styleUrl: './organization-settings.page.scss',
})
export class OrganizationSettingsPage {
  private readonly api = inject(OrganizationSettingsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly permissionDenied = signal(false);

  readonly canView = computed(() => this.sessionStore.hasPermission('settings.view'));
  readonly canManage = computed(() => this.sessionStore.hasPermission('settings.manage'));
  readonly canUpdateOrg = computed(() => this.sessionStore.hasPermission('organization.update'));

  private organizationVersion = 1;
  private settingsVersion = 1;

  readonly profileForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    timezone: ['Asia/Karachi', [Validators.required]],
  });

  readonly settingsForm = this.formBuilder.nonNullable.group({
    tradingName: [''],
    contactPhone: [''],
    contactEmail: [''],
    addressLine: [''],
    documentFooterNote: [''],
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView() && !this.sessionStore.hasPermission('organization.view')) {
      this.loading.set(false);
      this.permissionDenied.set(true);
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    forkJoin({
      organization: this.api.getOrganization(),
      settings: this.api.getSettings(),
    }).subscribe({
      next: ({ organization, settings }) => {
        this.applyOrganization(organization);
        this.applySettings(settings);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load organization settings.'));
        if (error instanceof HttpErrorResponse && error.status === 403) {
          this.permissionDenied.set(true);
        }
      },
    });
  }

  saveProfile(): void {
    if (!this.canUpdateOrg() || this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api
      .updateOrganization({
        expectedVersion: this.organizationVersion,
        name: this.profileForm.controls.name.value,
        timezone: this.profileForm.controls.timezone.value,
      })
      .subscribe({
        next: (organization) => {
          this.applyOrganization(organization);
          this.saving.set(false);
          this.successMessage.set('Organization profile saved.');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to save organization profile.'));
        },
      });
  }

  saveSettings(): void {
    if (!this.canManage() || this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.settingsForm.getRawValue();
    this.api
      .updateSettings({
        expectedVersion: this.settingsVersion,
        ...value,
      })
      .subscribe({
        next: (settings) => {
          this.applySettings(settings);
          this.saving.set(false);
          this.successMessage.set('Organization settings saved.');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to save organization settings.'));
        },
      });
  }

  private applyOrganization(organization: OrganizationProfile): void {
    this.organizationVersion = organization.version;
    this.profileForm.patchValue({
      name: organization.name,
      timezone: organization.timezone,
    });
    if (!this.canUpdateOrg()) {
      this.profileForm.disable();
    }
  }

  private applySettings(settings: OrganizationSettings): void {
    this.settingsVersion = settings.version;
    this.settingsForm.patchValue({
      tradingName: settings.tradingName,
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
      addressLine: settings.addressLine,
      documentFooterNote: settings.documentFooterNote,
    });
    if (!this.canManage()) {
      this.settingsForm.disable();
    }
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    const code = error.error?.error?.code;
    if (code === 'VERSION_CONFLICT') {
      return 'This record changed elsewhere. Reload and try again.';
    }
    if (error.status === 403) {
      return 'You do not have permission for this action.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
