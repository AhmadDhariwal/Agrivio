import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  OrganizationProfile,
  OrganizationSettings,
  OrganizationSettingsApi,
} from '../../data-access/organization-settings.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';

const COMMON_TIMEZONES = [
  'Asia/Karachi',
  'UTC',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Europe/London',
  'America/New_York',
  'Asia/Singapore',
  'Asia/Dhaka',
  'Asia/Kolkata',
];

@Component({
  selector: 'agrivio-organization-settings-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './organization-settings.page.html',
  styleUrl: './organization-settings.page.scss',
})
export class OrganizationSettingsPage {
  private readonly api = inject(OrganizationSettingsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly savingProfile = signal(false);
  readonly savingSettings = signal(false);
  readonly saving = computed(() => this.savingProfile() || this.savingSettings());

  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly permissionDenied = signal(false);

  readonly organization = signal<OrganizationProfile | null>(null);
  readonly settings = signal<OrganizationSettings | null>(null);

  readonly canView = computed(() => this.sessionStore.hasPermission('settings.view'));
  readonly canManage = computed(() => this.sessionStore.hasPermission('settings.manage'));
  readonly canUpdateOrg = computed(() => this.sessionStore.hasPermission('organization.update'));

  // Settings Module & Capability Controls
  readonly canUseSettingsModule = computed(
    () => this.capabilityService?.canUseModule('settings') ?? true,
  );
  readonly canShowSummary = computed(
    () => this.capabilityService?.canUseFeature('settings.features.summary') ?? true,
  );
  readonly canShowDocumentPreview = computed(
    () => this.capabilityService?.canUseFeature('settings.features.documentPreview') ?? true,
  );
  readonly canShowGuidance = computed(
    () => this.capabilityService?.canUseFeature('settings.features.guidance') ?? true,
  );
  readonly hasVisibleSidebar = computed(
    () => this.canShowSummary() || this.canShowDocumentPreview() || this.canShowGuidance(),
  );

  readonly canViewTradingName = computed(
    () => this.capabilityService?.canViewField('settings.fields.tradingName') ?? true,
  );
  readonly canViewContactPhone = computed(
    () => this.capabilityService?.canViewField('settings.fields.contactPhone') ?? true,
  );
  readonly canViewContactEmail = computed(
    () => this.capabilityService?.canViewField('settings.fields.contactEmail') ?? true,
  );
  readonly canViewAddressLine = computed(
    () => this.capabilityService?.canViewField('settings.fields.addressLine') ?? true,
  );
  readonly canViewDocumentFooterNote = computed(
    () => this.capabilityService?.canViewField('settings.fields.documentFooterNote') ?? true,
  );

  readonly canUpdateSettingsAction = computed(
    () => this.capabilityService?.canPerformAction('settings.actions.update') ?? true,
  );
  readonly canSaveSettings = computed(
    () => this.canManage() && this.canUpdateSettingsAction(),
  );

  readonly canEditTradingName = computed(
    () =>
      (this.capabilityService?.canEditField('settings.fields.tradingName') ?? true) &&
      this.canSaveSettings(),
  );
  readonly canEditContactPhone = computed(
    () =>
      (this.capabilityService?.canEditField('settings.fields.contactPhone') ?? true) &&
      this.canSaveSettings(),
  );
  readonly canEditContactEmail = computed(
    () =>
      (this.capabilityService?.canEditField('settings.fields.contactEmail') ?? true) &&
      this.canSaveSettings(),
  );
  readonly canEditAddressLine = computed(
    () =>
      (this.capabilityService?.canEditField('settings.fields.addressLine') ?? true) &&
      this.canSaveSettings(),
  );
  readonly canEditDocumentFooterNote = computed(
    () =>
      (this.capabilityService?.canEditField('settings.fields.documentFooterNote') ?? true) &&
      this.canSaveSettings(),
  );

  readonly fieldRequired = hasRequiredValidator;

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

  private readonly profileFormValues = toSignal(this.profileForm.valueChanges, {
    initialValue: this.profileForm.getRawValue(),
  });

  private readonly settingsFormValues = toSignal(this.settingsForm.valueChanges, {
    initialValue: this.settingsForm.getRawValue(),
  });

  readonly availableTimezones = computed(() => {
    const list = [...COMMON_TIMEZONES];
    const current = this.organization()?.timezone;
    if (current && !list.includes(current)) {
      list.unshift(current);
    }
    return list;
  });

  // Authoritative values for Settings Summary & Document Preview
  readonly statusLabel = computed(() => {
    const status = this.organization()?.status;
    if (!status) return 'Active';
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  });

  readonly isStatusActive = computed(() => {
    const status = (this.organization()?.status ?? 'active').toLowerCase();
    return status === 'active' || status === 'approved';
  });

  readonly displayTimezone = computed(
    () => this.profileFormValues().timezone || this.organization()?.timezone || 'Asia/Karachi',
  );

  readonly displayEmail = computed(() => {
    const contact = (this.settingsFormValues().contactEmail ?? '').trim();
    if (contact) return contact;
    return 'Not set';
  });

  readonly billingAccessStatus = computed(() => {
    const state = this.sessionStore.session()?.subscriptionAccessState;
    if (!state) return 'Enabled';
    if (state.billingAccessAllowed === false) return 'Restricted';
    if (state.status === 'suspended') return 'Suspended';
    return 'Enabled';
  });

  readonly previewOrgName = computed(() => {
    const trading = this.canViewTradingName()
      ? (this.settingsFormValues().tradingName ?? '').trim()
      : '';
    if (trading) return trading;
    const legal = (this.profileFormValues().name ?? '').trim();
    if (legal) return legal;
    return this.organization()?.name || 'Agrivio Demo Agrochemicals (Pvt) Ltd';
  });

  readonly previewAddress = computed(() => {
    if (!this.canViewAddressLine()) return '';
    const addr = (this.settingsFormValues().addressLine ?? '').trim();
    if (addr) return addr;
    return this.settings()?.addressLine || 'Address not specified';
  });

  readonly previewFooterNote = computed(() => {
    if (!this.canViewDocumentFooterNote()) return '';
    const note = (this.settingsFormValues().documentFooterNote ?? '').trim();
    if (note) return note;
    return (
      this.settings()?.documentFooterNote ||
      'This document is system generated and does not require a signature.'
    );
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.permissionDenied.set(true);
      return;
    }
    if (!this.canUseSettingsModule()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    forkJoin({
      organization: this.api.getOrganization(),
      settings: this.api.getSettings(),
    }).subscribe({
      next: ({ organization, settings }) => {
        this.organization.set(organization);
        this.settings.set(settings);
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
    this.savingProfile.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api
      .updateOrganization({
        expectedVersion: this.organizationVersion,
        name: this.profileForm.controls.name.value.trim(),
        timezone: this.profileForm.controls.timezone.value.trim(),
      })
      .subscribe({
        next: (organization) => {
          this.organization.set(organization);
          this.applyOrganization(organization);
          this.savingProfile.set(false);
          this.successMessage.set('Organization profile saved.');
        },
        error: (error: unknown) => {
          this.savingProfile.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to save organization profile.'));
        },
      });
  }

  resetProfile(): void {
    const org = this.organization();
    if (org) {
      this.applyOrganization(org);
    }
  }

  saveSettings(): void {
    if (!this.canSaveSettings() || this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }
    this.savingSettings.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const value = this.settingsForm.getRawValue();
    const payload: {
      expectedVersion: number;
      tradingName?: string;
      contactPhone?: string;
      contactEmail?: string;
      addressLine?: string;
      documentFooterNote?: string;
    } = {
      expectedVersion: this.settingsVersion,
    };
    if (this.canViewTradingName() && this.canEditTradingName()) {
      payload.tradingName = value.tradingName.trim();
    }
    if (this.canViewContactPhone() && this.canEditContactPhone()) {
      payload.contactPhone = value.contactPhone.trim();
    }
    if (this.canViewContactEmail() && this.canEditContactEmail()) {
      payload.contactEmail = value.contactEmail.trim();
    }
    if (this.canViewAddressLine() && this.canEditAddressLine()) {
      payload.addressLine = value.addressLine.trim();
    }
    if (this.canViewDocumentFooterNote() && this.canEditDocumentFooterNote()) {
      payload.documentFooterNote = value.documentFooterNote.trim();
    }
    this.api
      .updateSettings(payload)
      .subscribe({
        next: (settings) => {
          this.settings.set(settings);
          this.applySettings(settings);
          this.savingSettings.set(false);
          this.successMessage.set('Organization settings saved.');
        },
        error: (error: unknown) => {
          this.savingSettings.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to save organization settings.'));
        },
      });
  }

  resetSettings(): void {
    const set = this.settings();
    if (set) {
      this.applySettings(set);
    }
  }

  private applyOrganization(organization: OrganizationProfile): void {
    this.organizationVersion = organization.version;
    this.profileForm.patchValue({
      name: organization.name,
      timezone: organization.timezone || 'Asia/Karachi',
    });
    this.profileForm.markAsPristine();
    if (!this.canUpdateOrg()) {
      this.profileForm.disable();
    } else {
      this.profileForm.enable();
    }
  }

  private applySettings(settings: OrganizationSettings): void {
    this.settingsVersion = settings.version;
    this.settingsForm.patchValue({
      tradingName: settings.tradingName ?? '',
      contactPhone: settings.contactPhone ?? '',
      contactEmail: settings.contactEmail ?? '',
      addressLine: settings.addressLine ?? '',
      documentFooterNote: settings.documentFooterNote ?? '',
    });
    this.settingsForm.markAsPristine();
    if (!this.canSaveSettings()) {
      this.settingsForm.disable();
    } else {
      this.settingsForm.enable();
      if (!this.canEditTradingName()) this.settingsForm.controls.tradingName.disable();
      if (!this.canEditContactPhone()) this.settingsForm.controls.contactPhone.disable();
      if (!this.canEditContactEmail()) this.settingsForm.controls.contactEmail.disable();
      if (!this.canEditAddressLine()) this.settingsForm.controls.addressLine.disable();
      if (!this.canEditDocumentFooterNote()) this.settingsForm.controls.documentFooterNote.disable();
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
