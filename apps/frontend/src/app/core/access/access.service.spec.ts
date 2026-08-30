import { TestBed } from '@angular/core/testing';
import { AccessService } from './access.service';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';
import { CapabilityService } from '../../features/capabilities/data-access/capability.service';

describe('AccessService', () => {
  function setup(permissions: string[], role = 'Cashier', capabilityOn = true): AccessService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AccessService,
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (code: string) => permissions.includes(code),
            activeContext: () => ({
              contextType: 'organization',
              organizationId: 'org-1',
              role,
              permissions,
              branchAssignments: role === 'Owner' ? [] : [],
              warehouseAssignments: role === 'Owner' ? [] : [],
            }),
          },
        },
        {
          provide: CapabilityService,
          useValue: { canUseModule: () => capabilityOn },
        },
      ],
    });
    return TestBed.inject(AccessService);
  }

  it('answers can / canAny / canAll from session permissions', () => {
    const access = setup(['sales.view', 'sales.create']);
    expect(access.can('sales.view')).toBe(true);
    expect(access.can('purchases.view')).toBe(false);
    expect(access.canAny(['purchases.view', 'sales.view'])).toBe(true);
    expect(access.canAll(['sales.view', 'sales.create'])).toBe(true);
    expect(access.canAll(['sales.view', 'sales.cancel'])).toBe(false);
  });

  it('intersects permission with capability for module access', () => {
    const allowed = setup(['purchases.view'], 'Manager', true);
    expect(allowed.canAccessModule('purchases.view', 'purchases')).toBe(true);

    const capabilityOff = setup(['purchases.view'], 'Manager', false);
    expect(capabilityOff.canAccessModule('purchases.view', 'purchases')).toBe(false);

    const noPermission = setup(['sales.view'], 'Cashier', true);
    expect(noPermission.canAccessModule('purchases.view', 'purchases')).toBe(false);
  });

  it('treats missing assignments as a scoped-role UX state, not Owner-wide access', () => {
    const cashier = setup(['sales.view'], 'Cashier', true);
    expect(cashier.isOrganizationWide()).toBe(false);
    expect(cashier.hasMissingAssignments()).toBe(true);

    const owner = setup(['sales.view'], 'Owner', true);
    expect(owner.isOrganizationWide()).toBe(true);
    expect(owner.hasMissingAssignments()).toBe(false);
  });
});
