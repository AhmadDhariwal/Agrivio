import { describe, expect, it } from 'vitest';
import {
  PERMISSION_CATALOG,
  ROLE_MATRIX,
  hasPermission,
  isKnownPermission,
  permissionsForMembershipRole,
  permissionsForPlatformAccess,
} from './role-permissions.js';

describe('role permission catalog', () => {
  it('covers the frozen 81 permissions and default-denies unknowns', () => {
    expect(PERMISSION_CATALOG).toHaveLength(81);
    expect(Object.keys(ROLE_MATRIX)).toHaveLength(81);
    expect(isKnownPermission('organization.view')).toBe(true);
    expect(isKnownPermission('not.a.real.permission')).toBe(false);
    expect(hasPermission(['organization.view'], 'not.a.real.permission')).toBe(false);
  });

  it('resolves Owner, Cashier conditional grants, and Super Admin platform-only bundles', () => {
    const owner = permissionsForMembershipRole('Owner');
    expect(owner).toContain('organization.view');
    expect(owner).toContain('inventory.negative-stock.override');
    expect(owner).not.toContain('platform.organizations.view');

    const manager = permissionsForMembershipRole('Manager');
    expect(manager).toContain('sales.create');
    expect(manager).toContain('users.create');
    expect(manager).toContain('users.update');
    expect(manager).toContain('users.deactivate');
    expect(manager).toContain('users.assign-access');
    expect(manager).not.toContain('inventory.negative-stock.override');
    expect(permissionsForMembershipRole('Manager', ['audit.view'])).toContain('audit.view');

    const cashier = permissionsForMembershipRole('Cashier');
    expect(cashier).toContain('sales.create');
    expect(cashier).not.toContain('pricing.override');
    expect(permissionsForMembershipRole('Cashier', ['pricing.override'])).toContain(
      'pricing.override',
    );
    expect(permissionsForMembershipRole('Cashier', ['sales.cancel'])).not.toContain('sales.cancel');

    const storeKeeper = permissionsForMembershipRole('StoreKeeper');
    expect(storeKeeper).toContain('purchases.create');
    expect(storeKeeper).not.toContain('sales.create');

    const platform = permissionsForPlatformAccess('super_admin');
    expect(platform).toContain('platform.organizations.approve');
    expect(platform).not.toContain('organization.view');
    expect(platform).not.toContain('operations.restore.execute');
  });
});
