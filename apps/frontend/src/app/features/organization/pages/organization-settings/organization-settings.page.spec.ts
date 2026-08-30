import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { OrganizationSettingsPage } from './organization-settings.page';
import { OrganizationSettingsApi } from '../../data-access/organization-settings.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('OrganizationSettingsPage', () => {
  let fixture: ComponentFixture<OrganizationSettingsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizationSettingsPage],
      providers: [
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
                tradingName: '',
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
              permission === 'settings.view' ||
              permission === 'settings.manage' ||
              permission === 'organization.view' ||
              permission === 'organization.update',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationSettingsPage);
    fixture.detectChanges();
  });

  it('renders settings form', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="organization-settings"]')).toBeTruthy();
  });
});

describe('OrganizationSettingsPage manager read-only', () => {
  let fixture: ComponentFixture<OrganizationSettingsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizationSettingsPage],
      providers: [
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
                tradingName: 'Trading',
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
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationSettingsPage);
    fixture.detectChanges();
  });

  it('hides save actions and disables settings fields for managers', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="settings-save"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('You can view settings but cannot change them.');
    expect(fixture.componentInstance.settingsForm.disabled).toBe(true);
    expect(fixture.componentInstance.profileForm.disabled).toBe(true);
  });
});
