import { describe, expect, it } from 'vitest';
import accountsModule from './accounts.module';

const { createAccountsModule } = accountsModule;

describe('Accounts authoritative summary service', () => {
  it('aggregates total, active, inactive accounts and total balance accurately with tenant isolation', async () => {
    const accounts = createAccountsModule({ persistence: 'memory' });
    const actor = { actorId: 'actor-1' };

    // Empty org summary
    const emptySummary = await accounts.accountsService.getAccountsSummary('org-empty');
    expect(emptySummary).toEqual({
      totalAccounts: 0,
      activeAccounts: 0,
      inactiveAccounts: 0,
      totalBalance: {
        amount: '0.00',
        currency: 'PKR',
      },
    });

    // Create accounts in org-1
    const cash1 = await accounts.accountsService.createAccount(
      'org-1',
      { name: 'Cash Account 1', accountType: 'cash' },
      actor,
    );
    const bank1 = await accounts.accountsService.createAccount(
      'org-1',
      { name: 'Bank Account 1', accountType: 'bank', bankName: 'Meezan Bank' },
      actor,
    );
    const wallet1 = await accounts.accountsService.createAccount(
      'org-1',
      { name: 'Wallet Account 1', accountType: 'jazzcash', walletIdentifier: '03001234567' },
      actor,
    );

    // Deactivate wallet1
    await accounts.accountsService.updateAccount(
      'org-1',
      wallet1.id,
      { expectedVersion: 1, status: 'inactive' },
      actor,
    );

    // Post opening balance on cash1 (100.00 PKR)
    await accounts.accountsService.postOpeningBalance(
      'org-1',
      cash1.id,
      { amount: { amount: '100.00', currency: 'PKR' } },
      actor,
      'idemp-open-1',
    );

    // Post manual inflow on bank1 (250.50 PKR)
    await accounts.accountsService.postManualAccountTransaction(
      'org-1',
      {
        accountId: bank1.id,
        direction: 'inflow',
        amount: { amount: '250.50', currency: 'PKR' },
        purpose: 'Direct investment deposit',
      },
      actor,
      'idemp-inflow-1',
    );

    // Create an account in org-2 with huge balance to verify tenant isolation
    const org2Account = await accounts.accountsService.createAccount(
      'org-2',
      { name: 'Org 2 Cash', accountType: 'cash' },
      actor,
    );
    await accounts.accountsService.postOpeningBalance(
      'org-2',
      org2Account.id,
      { amount: { amount: '999999.00', currency: 'PKR' } },
      actor,
      'idemp-org2-open',
    );

    // Assert org-1 summary
    const org1Summary = await accounts.accountsService.getAccountsSummary('org-1');
    expect(org1Summary).toEqual({
      totalAccounts: 3,
      activeAccounts: 2,
      inactiveAccounts: 1,
      totalBalance: {
        amount: '350.50',
        currency: 'PKR',
      },
    });

    // Assert org-2 summary
    const org2Summary = await accounts.accountsService.getAccountsSummary('org-2');
    expect(org2Summary).toEqual({
      totalAccounts: 1,
      activeAccounts: 1,
      inactiveAccounts: 0,
      totalBalance: {
        amount: '999999.00',
        currency: 'PKR',
      },
    });
  });
});
