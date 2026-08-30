import { describe, expect, it } from 'vitest';
import { ApiTransportErrorCode } from '@agrivio/api-contracts';
import {
  ORGANIZATION_ROLES,
  assignableRolesForActor,
  canManageConditionalGrants,
  canManageOrganizationRole,
  assertCanAssignRole,
  assertCanManageMembership,
} from './role-hierarchy.js';

describe('organization role hierarchy', () => {
  it('lets Owner assign every organization role and Manager only subordinates', () => {
    expect(ORGANIZATION_ROLES).toEqual(['Owner', 'Manager', 'Cashier', 'StoreKeeper']);
    expect(assignableRolesForActor('Owner')).toEqual(['Owner', 'Manager', 'Cashier', 'StoreKeeper']);
    expect(assignableRolesForActor('Manager')).toEqual(['Cashier', 'StoreKeeper']);
    expect(assignableRolesForActor('Cashier')).toEqual([]);
    expect(canManageOrganizationRole('Owner', 'Owner')).toBe(true);
    expect(canManageOrganizationRole('Manager', 'Cashier')).toBe(true);
    expect(canManageOrganizationRole('Manager', 'StoreKeeper')).toBe(true);
    expect(canManageOrganizationRole('Manager', 'Manager')).toBe(false);
    expect(canManageOrganizationRole('Manager', 'Owner')).toBe(false);
    expect(canManageConditionalGrants('Owner')).toBe(true);
    expect(canManageConditionalGrants('Manager')).toBe(false);
  });

  it('rejects Manager attempts to create or mutate Owner or Manager', () => {
    try {
      assertCanAssignRole('Manager', 'Owner');
      expect.unreachable('expected hierarchy denial');
    } catch (error) {
      expect(error).toMatchObject({ code: ApiTransportErrorCode.RoleHierarchyDenied });
    }
    try {
      assertCanManageMembership('Manager', 'Manager');
      expect.unreachable('expected hierarchy denial');
    } catch (error) {
      expect(error).toMatchObject({ code: ApiTransportErrorCode.RoleHierarchyDenied });
    }
  });
});
