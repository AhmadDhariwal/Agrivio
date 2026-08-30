import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { appRoutes } from '../../../app.routes';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { CANONICAL_NAVIGATION } from '../../shell/data-access/navigation.model';
import { CapabilityService } from './capability.service';

describe('Setup CapabilityService defaults', () => {
  it('preserves current behavior and wires route/navigation gating', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);
    const features = [
      'moduleInfo',
      'summary',
      'subscriptionNotice',
      'search',
      'statusFilter',
      'taskList',
      'operationalReadiness',
      'notes',
    ];

    expect(service.canUseModule('setup')).toBe(true);
    for (const id of features) {
      expect(service.canUseFeature(`setup.features.${id}`)).toBe(true);
    }
    expect(service.canPerformAction('setup.actions.refresh')).toBe(true);

    const app = appRoutes.find((route) => route.path === 'app');
    expect(
      app?.children?.find((route) => route.path === 'organization/setup')?.canActivate,
    ).toHaveLength(2);
    const navigation = CANONICAL_NAVIGATION.flatMap((entry) =>
      entry.type === 'group' ? entry.group.children : [entry.item],
    );
    expect(navigation.find((item) => item.id === 'organization.setup')).toMatchObject({
      permission: 'settings.view',
      capabilityKey: 'setup',
    });
  });
});
