import { describe, expect, it } from 'vitest';
import {
  assertOwnerPresence,
  assertOwnerPresenceAfterMembershipChange,
  countActiveOwners,
} from './owner-presence.js';
import { ApiTransportErrorCode } from '@agrivio/api-contracts';

describe('owner presence invariant hooks', () => {
  const memberships = [
    { _id: 'm1', role: 'Owner', status: 'active' },
    { _id: 'm2', role: 'Cashier', status: 'active' },
  ];

  it('counts active owners and allows safe cashier deactivation', () => {
    expect(countActiveOwners(memberships)).toBe(1);
    const next = assertOwnerPresenceAfterMembershipChange(memberships, 'm2', {
      status: 'deactivated',
    });
    expect(countActiveOwners(next)).toBe(1);
    assertOwnerPresence(next);
  });

  it('blocks deactivating or demoting the last active Owner', () => {
    try {
      assertOwnerPresenceAfterMembershipChange(memberships, 'm1', { status: 'deactivated' });
      expect.unreachable('expected owner deactivation to fail');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'AppError',
        code: ApiTransportErrorCode.LastOwnerProtected,
      });
    }

    try {
      assertOwnerPresenceAfterMembershipChange(memberships, 'm1', { role: 'Manager' });
      expect.unreachable('expected owner demotion to fail');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'AppError',
        code: ApiTransportErrorCode.LastOwnerProtected,
      });
    }
  });
});
