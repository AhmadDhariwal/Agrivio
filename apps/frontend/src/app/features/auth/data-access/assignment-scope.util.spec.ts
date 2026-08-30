import { describe, expect, it } from 'vitest';
import {
  filterBranchOptions,
  filterWarehouseOptions,
  hasMissingOperationalAssignments,
  isBranchSelectable,
  isWarehouseSelectable,
} from './assignment-scope.util';
import { AuthSessionContext } from './auth.api';

describe('assignment-scope.util', () => {
  const cashierContext: AuthSessionContext = {
    contextType: 'organization',
    organizationId: 'org-1',
    role: 'Cashier',
    permissions: ['branches.view'],
    branchAssignments: [{ targetId: 'branch-a' }],
    warehouseAssignments: [{ targetId: 'wh-a' }],
  };

  const ownerContext: AuthSessionContext = {
    contextType: 'organization',
    organizationId: 'org-1',
    role: 'Owner',
    permissions: ['branches.view'],
    branchAssignments: [],
    warehouseAssignments: [],
  };

  it('filters selector options using assignment rules without trusting client scope', () => {
    expect(isBranchSelectable(cashierContext, 'branch-a')).toBe(true);
    expect(isBranchSelectable(cashierContext, 'branch-b')).toBe(false);
    expect(isWarehouseSelectable(cashierContext, 'wh-a')).toBe(true);
    expect(isWarehouseSelectable(cashierContext, 'wh-b')).toBe(false);

    expect(isBranchSelectable(ownerContext, 'any-branch')).toBe(true);
    expect(isWarehouseSelectable(ownerContext, 'any-wh')).toBe(true);

    expect(
      filterBranchOptions(cashierContext, [{ id: 'branch-a' }, { id: 'branch-b' }]).map(
        (item) => item.id,
      ),
    ).toEqual(['branch-a']);
    expect(
      filterWarehouseOptions(cashierContext, [{ id: 'wh-a' }, { id: 'wh-b' }]).map((item) => item.id),
    ).toEqual(['wh-a']);
  });

  it('does not treat empty assignments as organization-wide access for non-Owner roles', () => {
    const unassignedCashier: AuthSessionContext = {
      ...cashierContext,
      branchAssignments: [],
      warehouseAssignments: [],
    };
    expect(hasMissingOperationalAssignments(unassignedCashier)).toBe(true);
    expect(hasMissingOperationalAssignments(ownerContext)).toBe(false);
    expect(hasMissingOperationalAssignments(cashierContext)).toBe(false);
  });
});
