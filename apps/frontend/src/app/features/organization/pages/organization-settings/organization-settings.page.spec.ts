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
