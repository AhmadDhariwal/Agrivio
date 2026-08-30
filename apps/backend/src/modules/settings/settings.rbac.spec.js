import { describe, expect, it } from 'vitest';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';

describe('settings RBAC matrix', () => {
  it('grants Owner manage and view, Manager view only, Cashier/StoreKeeper neither', () => {
    const owner = permissionsForMembershipRole('Owner');
    expect(owner).toContain('settings.view');
    expect(owner).toContain('settings.manage');

    const manager = permissionsForMembershipRole('Manager');
    expect(manager).toContain('settings.view');
    expect(manager).not.toContain('settings.manage');

    const cashier = permissionsForMembershipRole('Cashier');
    expect(cashier).not.toContain('settings.view');
    expect(cashier).not.toContain('settings.manage');

    const storeKeeper = permissionsForMembershipRole('StoreKeeper');
    expect(storeKeeper).not.toContain('settings.view');
    expect(storeKeeper).not.toContain('settings.manage');
  });

  it('does not elevate Manager view into manage through conditional grants', () => {
    const managerWithExtra = permissionsForMembershipRole('Manager', ['settings.manage']);
    expect(managerWithExtra).toContain('settings.view');
    expect(managerWithExtra).not.toContain('settings.manage');
  });
});
