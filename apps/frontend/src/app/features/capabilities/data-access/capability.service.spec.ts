import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { CapabilitiesApi } from './capabilities.api';
import { CapabilityService } from './capability.service';

describe('CapabilityService', () => {
  it('refreshes effective organization capabilities without a new session', () => {
    let cardsEnabled = true;
    const api = {
      getCurrent: () =>
        of({
          organizationId: 'org-1',
          version: cardsEnabled ? 1 : 2,
          controls: [
            {
              key: 'inventory.products.views.desktopCards',
              type: 'VIEW' as const,
              value: { enabled: cardsEnabled },
              reasons: [],
            },
          ],
        }),
    };
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        { provide: CapabilitiesApi, useValue: api },
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);

    service.refresh().subscribe();
    expect(service.canUseView('inventory.products.views.desktopCards')).toBe(true);
    expect(service.version()).toBe(1);

    cardsEnabled = false;
    service.refresh().subscribe();
    expect(service.canUseView('inventory.products.views.desktopCards')).toBe(false);
    expect(service.version()).toBe(2);
  });
});
