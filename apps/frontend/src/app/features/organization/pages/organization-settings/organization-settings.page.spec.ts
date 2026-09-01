import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OrganizationSettingsPage } from './organization-settings.page';
import { OrganizationSettingsApi } from '../../data-access/organization-settings.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('OrganizationSettingsPage', () => {
  let fixture: ComponentFixture<OrganizationSettingsPage>;
  let component: OrganizationSettingsPage;
  let updateOrgSpy: ReturnType<typeof vi.fn>;
  let updateSettingsSpy: ReturnType<typeof vi.fn>;

  const mockOrgData = {
    id: 'org-1',
    name: 'Agrivio Demo Agrochemicals (Pvt) Ltd',
    status: 'approved',
    timezone: 'Asia/Karachi',
    version: 1,
  };

  const mockSettingsData = {
    id: 'set-1',
    organizationId: 'org-1',
    tradingName: 'Agrivio Demo Agrochemicals',
    contactPhone: '+92 21 1234 5678',
    contactEmail: 'demo.owner@agrivio.test',
    addressLine: 'Suite 204, 2nd Floor, Business Park, Karachi',
    documentFooterNote: 'This document is system generated and does not require a signature.',
    version: 1,
  };

  beforeEach(async () => {
    updateOrgSpy = vi.fn().mockReturnValue(
      of({
        ...mockOrgData,
        name: 'Agrivio Demo Updated Ltd',
        version: 2,
      }),
    );
    updateSettingsSpy = vi.fn().mockReturnValue(
      of({
        ...mockSettingsData,
        tradingName: 'Agrivio Updated Trading',
        version: 2,
      }),
    );

    await TestBed.configureTestingModule({
      imports: [OrganizationSettingsPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: OrganizationSettingsApi,
          useValue: {
            getOrganization: () => of(mockOrgData),
            getSettings: () => of(mockSettingsData),
            updateOrganization: updateOrgSpy,
            updateSettings: updateSettingsSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (permission: string) =>
              permission === 'settings.view' ||
              permission === 'settings.manage' ||
              permission === 'organization.view' ||
              permission === 'organization.update',
            session: () => ({
              user: { email: 'demo.owner@agrivio.test' },
              subscriptionAccessState: { billingAccessAllowed: true, status: 'active' },
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationSettingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders settings grid, cards, breadcrumbs, and form controls', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="organization-settings"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="organization-profile-card"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="residual-settings-card"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="settings-summary-card"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="document-preview-card"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="what-belongs-here-card"]')).toBeTruthy();

    expect(el.querySelector('.page-head__title')?.textContent).toContain('Organization settings');
    expect(el.querySelector('.page-head__eyebrow')?.textContent).toContain('SETUP');
    expect(el.querySelector('.page-head__breadcrumbs')?.textContent).toContain('Organization');
  });

  it('populates forms with loaded API data', () => {
    expect(component.profileForm.controls.name.value).toBe('Agrivio Demo Agrochemicals (Pvt) Ltd');
    expect(component.profileForm.controls.timezone.value).toBe('Asia/Karachi');
    expect(component.settingsForm.controls.tradingName.value).toBe('Agrivio Demo Agrochemicals');
    expect(component.settingsForm.controls.contactPhone.value).toBe('+92 21 1234 5678');
    expect(component.settingsForm.controls.contactEmail.value).toBe('demo.owner@agrivio.test');
    expect(component.settingsForm.controls.addressLine.value).toContain('Suite 204');
    expect(component.settingsForm.controls.documentFooterNote.value).toContain('system generated');
  });

  it('computes authoritative summary metrics and document preview', () => {
    expect(component.statusLabel()).toBe('Approved');
    expect(component.isStatusActive()).toBe(true);
    expect(component.displayTimezone()).toBe('Asia/Karachi');
    expect(component.displayEmail()).toBe('demo.owner@agrivio.test');
    expect(component.billingAccessStatus()).toBe('Enabled');
    expect(component.previewOrgName()).toBe('Agrivio Demo Agrochemicals');
    expect(component.previewAddress()).toContain('Suite 204');
    expect(component.previewFooterNote()).toContain('system generated');
  });

  it('saves organization profile on submit and updates success state', () => {
    component.profileForm.controls.name.setValue('Agrivio Demo Updated Ltd');
    component.saveProfile();

    expect(updateOrgSpy).toHaveBeenCalledWith({
      expectedVersion: 1,
      name: 'Agrivio Demo Updated Ltd',
      timezone: 'Asia/Karachi',
    });
    expect(component.successMessage()).toBe('Organization profile saved.');
    expect(component.savingProfile()).toBe(false);
  });

  it('resets profile form to last loaded values', () => {
    component.profileForm.controls.name.setValue('Changed Name');
    component.resetProfile();
    expect(component.profileForm.controls.name.value).toBe('Agrivio Demo Agrochemicals (Pvt) Ltd');
  });

  it('saves residual settings on submit and updates success state', () => {
    component.settingsForm.controls.tradingName.setValue('Agrivio Updated Trading');
    component.saveSettings();

    expect(updateSettingsSpy).toHaveBeenCalledWith({
      expectedVersion: 1,
      tradingName: 'Agrivio Updated Trading',
      contactPhone: '+92 21 1234 5678',
      contactEmail: 'demo.owner@agrivio.test',
      addressLine: 'Suite 204, 2nd Floor, Business Park, Karachi',
      documentFooterNote: 'This document is system generated and does not require a signature.',
    });
    expect(component.successMessage()).toBe('Organization settings saved.');
    expect(component.savingSettings()).toBe(false);
  });

  it('resets settings form to last loaded values', () => {
    component.settingsForm.controls.tradingName.setValue('Changed Trading');
    component.resetSettings();
    expect(component.settingsForm.controls.tradingName.value).toBe('Agrivio Demo Agrochemicals');
  });
});

describe('OrganizationSettingsPage manager read-only mode', () => {
  let fixture: ComponentFixture<OrganizationSettingsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizationSettingsPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: OrganizationSettingsApi,
          useValue: {
            getOrganization: () =>
              of({
                id: 'org-1',
                name: 'Demo Org',
                status: 'approved',
                timezone: 'Asia/Karachi',
                version: 1,
              }),
            getSettings: () =>
              of({
                id: 'set-1',
                organizationId: 'org-1',
                tradingName: 'Trading Only',
                contactPhone: '',
                contactEmail: '',
                addressLine: '',
                documentFooterNote: '',
                version: 1,
              }),
            updateOrganization: () => of({}),
            updateSettings: () => of({}),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (permission: string) =>
              permission === 'settings.view' || permission === 'organization.view',
            session: () => ({
              user: { email: 'manager@example.com' },
              subscriptionAccessState: { billingAccessAllowed: true, status: 'active' },
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationSettingsPage);
    fixture.detectChanges();
  });

  it('hides save actions and disables settings and profile fields for managers', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="settings-save"]')).toBeNull();
    expect(el.querySelector('[data-testid="profile-save"]')).toBeNull();
    expect(el.textContent).toContain('You can view settings but cannot change them.');
    expect(fixture.componentInstance.settingsForm.disabled).toBe(true);
    expect(fixture.componentInstance.profileForm.disabled).toBe(true);
  });
});

describe('OrganizationSettingsPage error & conflict handling', () => {
  it('maps VERSION_CONFLICT error to a friendly message', () => {
    TestBed.configureTestingModule({
      imports: [OrganizationSettingsPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: OrganizationSettingsApi,
          useValue: {
            getOrganization: () => of({ id: 'org-1', name: 'Org', timezone: 'UTC', version: 1 }),
            getSettings: () =>
              of({ id: 's-1', organizationId: 'org-1', tradingName: '', version: 1 }),
            updateOrganization: () => of({}),
            updateSettings: () =>
              throwError(
                () =>
                  new HttpErrorResponse({
                    status: 409,
                    error: { error: { code: 'VERSION_CONFLICT', message: 'Version conflict' } },
                  }),
              ),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
            session: () => null,
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(OrganizationSettingsPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.saveSettings();
    expect(component.errorMessage()).toBe('This record changed elsewhere. Reload and try again.');
  });
});
