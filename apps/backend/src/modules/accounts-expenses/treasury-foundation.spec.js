import { describe, expect, it } from 'vitest';

const { createAccountsModule } = require('./accounts.module');

async function createFixture() {
  const module = createAccountsModule({
    persistence: 'memory',
    now: () => new Date('2026-09-23T10:00:00.000Z'),
  });
  const actor = { actorId: 'owner-1' };
  const cash = await module.accountsService.createAccount(
    'org-1',
    { name: 'Main Cash', accountType: 'cash' },
    actor,
  );
  const bank = await module.accountsService.createAccount(
    'org-1',
    { name: 'HBL Bank', accountType: 'bank', bankName: 'HBL' },
    actor,
  );
  await module.accountsService.postOpeningBalance(
    'org-1',
    cash.id,
    { amount: { amount: '1000.00', currency: 'PKR' } },
    actor,
    'opening-cash',
  );
  return { ...module, actor, cash, bank };
}

describe('Treasury / Account Management Phase 1 foundation', () => {
  it('posts paired transfers without changing total liquid funds and reverses both legs', async () => {
    const { accountsService, actor, cash, bank } = await createFixture();
    const before = await accountsService.getAccountsSummary('org-1');

    const transfer = await accountsService.postAccountTransfer(
      'org-1',
      {
        fromAccountId: cash.id,
        toAccountId: bank.id,
        amount: { amount: '400.00', currency: 'PKR' },
        businessDate: '2026-09-23',
        reference: 'TR-400',
      },
      actor,
      'transfer-400',
    );
    expect(transfer.data.outboundMovementId).not.toBe(transfer.data.inboundMovementId);
    expect((await accountsService.getAccount('org-1', cash.id)).derivedBalances.balance.amount).toBe('600.00');
    expect((await accountsService.getAccount('org-1', bank.id)).derivedBalances.balance.amount).toBe('400.00');
    expect((await accountsService.getAccountsSummary('org-1')).totalLiquidFunds).toEqual(before.totalLiquidFunds);

    const reversed = await accountsService.reverseAccountTransfer(
      'org-1',
      transfer.data.id,
      { reason: 'Transfer entered in error' },
      actor,
      'transfer-400-reverse',
    );
    expect(reversed.data.status).toBe('reversed');
    expect((await accountsService.getAccount('org-1', cash.id)).derivedBalances.balance.amount).toBe('1000.00');
    expect((await accountsService.getAccount('org-1', bank.id)).derivedBalances.balance.amount).toBe('0.00');
  });

  it('posts categorized add/withdraw money once and keeps unrelated accounting domains untouched', async () => {
    const { accountsService, actor, cash } = await createFixture();
    const added = await accountsService.postManualAccountTransaction(
      'org-1',
      {
        accountId: cash.id,
        direction: 'inflow',
        amount: { amount: '50.00', currency: 'PKR' },
        category: 'unclassified',
        purpose: 'Cash found during reconciliation',
        businessDate: '2026-09-23',
      },
      actor,
      'manual-add-50',
    );
    const replay = await accountsService.postManualAccountTransaction(
      'org-1',
      {
        accountId: cash.id,
        direction: 'inflow',
        amount: { amount: '50.00', currency: 'PKR' },
        category: 'unclassified',
        purpose: 'Cash found during reconciliation',
        businessDate: '2026-09-23',
      },
      actor,
      'manual-add-50',
    );
    expect(replay.replay).toBe(true);
    expect(replay.data.id).toBe(added.data.id);

    await accountsService.postManualAccountTransaction(
      'org-1',
      {
        accountId: cash.id,
        direction: 'outflow',
        amount: { amount: '20.00', currency: 'PKR' },
        category: 'owner_withdrawal',
        purpose: 'Owner withdrawal',
      },
      actor,
      'manual-withdraw-20',
    );
    expect((await accountsService.getAccount('org-1', cash.id)).derivedBalances.balance.amount).toBe('1030.00');

    const history = await accountsService.listAccountMovements('org-1', cash.id, {
      direction: 'inflow',
      sourceType: 'manual_inflow',
      search: 'reconciliation',
      status: 'posted',
      fromDate: '2026-09-23',
      toDate: '2026-09-23',
      skip: 0,
      pageSize: 25,
    });
    expect(history.total).toBe(1);
    expect(history.items[0]).toMatchObject({
      sourceType: 'manual_inflow',
      category: 'unclassified',
      direction: 'inflow',
    });
    expect(history.items.every((item) => !/customer|supplier|inventory|sale|purchase|expense/.test(item.sourceType))).toBe(true);
  });

  it('sets actual balance through delta movements, handles no-op, rejects stale state, and reverses', async () => {
    const { accountsService, actor, cash } = await createFixture();
    const increase = await accountsService.adjustAccountBalance(
      'org-1',
      {
        accountId: cash.id,
        expectedCurrentBalance: { amount: '1000.00', currency: 'PKR' },
        desiredBalance: { amount: '1150.00', currency: 'PKR' },
        category: 'reconciliation',
        reason: 'Till count is higher than system balance',
        businessDate: '2026-09-23',
      },
      actor,
      'adjust-up',
    );
    expect(increase.data.delta.amount).toBe('150.00');
    expect(increase.data.sourceType).toBe('balance_adjustment_increase');
    const increaseReplay = await accountsService.adjustAccountBalance(
      'org-1',
      {
        accountId: cash.id,
        expectedCurrentBalance: { amount: '1000.00', currency: 'PKR' },
        desiredBalance: { amount: '1150.00', currency: 'PKR' },
        category: 'reconciliation',
        reason: 'Till count is higher than system balance',
        businessDate: '2026-09-23',
      },
      actor,
      'adjust-up',
    );
    expect(increaseReplay.replay).toBe(true);
    expect(increaseReplay.data.id).toBe(increase.data.id);

    const decrease = await accountsService.adjustAccountBalance(
      'org-1',
      {
        accountId: cash.id,
        expectedCurrentBalance: { amount: '1150.00', currency: 'PKR' },
        desiredBalance: { amount: '900.00', currency: 'PKR' },
        category: 'cash_difference',
        reason: 'Till count is lower than system balance',
      },
      actor,
      'adjust-down',
    );
    expect(decrease.data.delta.amount).toBe('-250.00');
    expect(decrease.data.sourceType).toBe('balance_adjustment_decrease');

    const noChange = await accountsService.adjustAccountBalance(
      'org-1',
      {
        accountId: cash.id,
        expectedCurrentBalance: { amount: '900.00', currency: 'PKR' },
        desiredBalance: { amount: '900.00', currency: 'PKR' },
        category: 'reconciliation',
        reason: 'Verified against bank statement',
      },
      actor,
      'adjust-noop',
    );
    expect(noChange.statusCode).toBe(200);
    expect(noChange.data).toMatchObject({ id: null, status: 'no_change' });

    await expect(accountsService.adjustAccountBalance(
      'org-1',
      {
        accountId: cash.id,
        expectedCurrentBalance: { amount: '1000.00', currency: 'PKR' },
        desiredBalance: { amount: '1200.00', currency: 'PKR' },
        category: 'unclassified',
        reason: 'Stale screen attempt',
      },
      actor,
      'adjust-stale',
    )).rejects.toMatchObject({ statusCode: 409 });

    await accountsService.reverseManualAccountTransaction(
      'org-1',
      decrease.data.id,
      { reason: 'Adjustment used the wrong cash count' },
      actor,
      'adjust-down-reverse',
    );
    expect((await accountsService.getAccount('org-1', cash.id)).derivedBalances.balance.amount).toBe('1150.00');
  });

  it('enforces tenant isolation for adjustments and excludes inactive account balances from liquid funds', async () => {
    const { accountsService, actor, cash } = await createFixture();
    await expect(accountsService.adjustAccountBalance(
      'org-2',
      {
        accountId: cash.id,
        expectedCurrentBalance: { amount: '1000.00', currency: 'PKR' },
        desiredBalance: { amount: '1200.00', currency: 'PKR' },
        category: 'reconciliation',
        reason: 'Cross tenant attempt',
      },
      actor,
      'cross-tenant-adjust',
    )).rejects.toMatchObject({ statusCode: 404 });

    await accountsService.updateAccount(
      'org-1',
      cash.id,
      { expectedVersion: 2, status: 'inactive' },
      actor,
    );
    const summary = await accountsService.getAccountsSummary('org-1');
    expect(summary.totalBalance.amount).toBe('1000.00');
    expect(summary.totalLiquidFunds.amount).toBe('0.00');
  });
});
