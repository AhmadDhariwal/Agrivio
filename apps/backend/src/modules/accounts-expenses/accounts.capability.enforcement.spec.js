import { describe, expect, it, vi } from 'vitest';
import accountsModule from './accounts.module';

const { createAccountsModule } = accountsModule;

describe('Accounts capability service enforcement', () => {
  it('delegates master-data, lifecycle, and direct financial workflows to semantic checks', async () => {
    const denied = new Error('capability denied');
    const capabilityService = {
      assertAccountCreateAllowed: vi.fn(),
      assertAccountPatchAllowed: vi.fn(),
      assertAccountDeleteAllowed: vi.fn().mockRejectedValue(denied),
      assertAccountOpeningBalanceAllowed: vi.fn().mockRejectedValue(denied),
      assertAccountManualMovementAllowed: vi.fn().mockRejectedValue(denied),
      assertAccountTransferAllowed: vi.fn().mockRejectedValue(denied),
      assertAccountMovementReversalAllowed: vi.fn().mockRejectedValue(denied),
      assertAccountTransferReversalAllowed: vi.fn().mockRejectedValue(denied),
    };
    const accounts = createAccountsModule({ persistence: 'memory', capabilityService });
    const actor = { actorId: 'actor-1' };
    const created = await accounts.accountsService.createAccount(
      'org-1',
      { name: 'Main Cash', accountType: 'cash' },
      actor,
    );
    const edited = await accounts.accountsService.updateAccount(
      'org-1',
      created.id,
      { expectedVersion: 1, name: 'Primary Cash' },
      actor,
    );
    await accounts.accountsService.updateAccount(
      'org-1',
      created.id,
      { expectedVersion: edited.version, status: 'inactive' },
      actor,
    );

    expect(capabilityService.assertAccountCreateAllowed).toHaveBeenCalledWith('org-1');
    expect(capabilityService.assertAccountPatchAllowed).toHaveBeenNthCalledWith(
      1,
      'org-1',
      expect.objectContaining({ name: 'Main Cash', status: 'active' }),
      expect.objectContaining({ name: 'Primary Cash' }),
    );
    expect(capabilityService.assertAccountPatchAllowed).toHaveBeenNthCalledWith(
      2,
      'org-1',
      expect.objectContaining({ status: 'active' }),
      { status: 'inactive' },
    );

    const calls = [
      () => accounts.accountsService.deleteAccount('org-1', created.id, actor),
      () => accounts.accountsService.postOpeningBalance('org-1', created.id, {}, actor, 'key'),
      () => accounts.accountsService.postManualAccountTransaction('org-1', {}, actor, 'key'),
      () => accounts.accountsService.postAccountTransfer('org-1', {}, actor, 'key'),
      () => accounts.accountsService.reverseManualAccountTransaction('org-1', 'tx-1', {}, actor, 'key'),
      () => accounts.accountsService.reverseAccountTransfer('org-1', 'transfer-1', {}, actor, 'key'),
    ];
    for (const call of calls) await expect(call()).rejects.toBe(denied);

    expect(capabilityService.assertAccountDeleteAllowed).toHaveBeenCalledWith('org-1');
    expect(capabilityService.assertAccountOpeningBalanceAllowed).toHaveBeenCalledWith('org-1');
    expect(capabilityService.assertAccountManualMovementAllowed).toHaveBeenCalledWith('org-1');
    expect(capabilityService.assertAccountTransferAllowed).toHaveBeenCalledWith('org-1');
    expect(capabilityService.assertAccountMovementReversalAllowed).toHaveBeenCalledWith('org-1');
    expect(capabilityService.assertAccountTransferReversalAllowed).toHaveBeenCalledWith('org-1');
  });
});
