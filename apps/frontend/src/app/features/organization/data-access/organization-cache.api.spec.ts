import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { OrganizationSettingsApi } from './organization-settings.api';
import { OrganizationSetupApi } from './organization-setup.api';
import { AuthApi } from '../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

describe('Organization APIs cache integration', () => {
  let settingsApi: OrganizationSettingsApi;
  let setupApi: OrganizationSetupApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthSessionStore,
          useValue: { activeContext: () => ({ organizationId: 'org-1' }) },
        },
        { provide: AuthApi, useValue: { ensureCsrf: () => of({ csrfToken: 'csrf' }) } },
      ],
    });
    settingsApi = TestBed.inject(OrganizationSettingsApi);
    setupApi = TestBed.inject(OrganizationSetupApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('reuses organization and settings reads independently', async () => {
    const firstOrg = firstValueFrom(settingsApi.getOrganization());
    http
      .expectOne((request) => request.url.endsWith('/api/v1/organization'))
      .flush({ data: { id: 'org-1' } });
    await firstOrg;
    await firstValueFrom(settingsApi.getOrganization());

    const firstSettings = firstValueFrom(settingsApi.getSettings());
    http
      .expectOne((request) => request.url.endsWith('/api/v1/settings'))
      .flush({ data: { id: 'settings-1' } });
    await firstSettings;
    await firstValueFrom(settingsApi.getSettings());
  });

  it('invalidates only the updated settings family plus derived setup', async () => {
    const settings = firstValueFrom(settingsApi.getSettings());
    http
      .expectOne((request) => request.url.endsWith('/api/v1/settings'))
      .flush({ data: { id: 'settings-1' } });
    await settings;
    const setup = firstValueFrom(setupApi.getSetupProgress());
    http
      .expectOne((request) => request.url.endsWith('/setup-progress'))
      .flush({ data: { steps: [], readyForOperations: false, notes: [] } });
    await setup;

    const updated = firstValueFrom(
      settingsApi.updateSettings({ expectedVersion: 1, tradingName: 'Agrivio' }),
    );
    http
      .expectOne((request) => request.url.endsWith('/api/v1/settings'))
      .flush({ data: { id: 'settings-1', version: 2 } });
    await updated;

    const settingsReload = firstValueFrom(settingsApi.getSettings());
    const setupReload = firstValueFrom(setupApi.getSetupProgress());
    http
      .expectOne((request) => request.url.endsWith('/api/v1/settings'))
      .flush({ data: { id: 'settings-1' } });
    http
      .expectOne((request) => request.url.endsWith('/setup-progress'))
      .flush({ data: { steps: [], readyForOperations: false, notes: [] } });
    await Promise.all([settingsReload, setupReload]);
  });

  it('force refresh bypasses cached setup progress', async () => {
    const first = firstValueFrom(setupApi.getSetupProgress());
    http
      .expectOne((request) => request.url.endsWith('/setup-progress'))
      .flush({ data: { steps: [], readyForOperations: false, notes: [] } });
    await first;
    const refreshed = firstValueFrom(setupApi.getSetupProgress(true));
    http
      .expectOne((request) => request.url.endsWith('/setup-progress'))
      .flush({ data: { steps: [], readyForOperations: false, notes: [] } });
    await refreshed;
  });
});
