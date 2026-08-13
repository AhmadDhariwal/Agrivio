import { expect, test } from '@playwright/test';
import {
  bootstrapApprovedOwner,
  createAccount,
  createAccountWithOpening,
  createBranchAndWarehouse,
} from './f07-p4-support';

test.describe('F07 P4 accounts vertical slice', () => {
  test('manual inflow/outflow, transfer, balances, and transfer reversal', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();

    await bootstrapApprovedOwner(page, request, {
      organizationName: `F07 P4 Accounts Org ${stamp}`,
      ownerEmail: `f07p4-accounts-${stamp}@example.com`,
      displayName: 'F07 P4 Accounts Owner',
    });
    await createBranchAndWarehouse(page, {
      branch: 'P4 Branch',
      prefix: 'P4A',
      warehouse: 'P4 WH',
    });
    await createAccountWithOpening(page, { name: 'P4 Cash', type: 'cash', opening: '1000.00' });
    await createAccount(page, { name: 'P4 Bank', type: 'bank', bankName: 'HBL' });

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P4 Cash' })
      .getByTestId('account-open')
      .click();

    await page.getByTestId('account-tx-direction').selectOption('inflow');
    await page.getByTestId('account-tx-amount').fill('250.00');
    await page.getByTestId('account-tx-purpose').fill('Owner injection');
    await page.getByTestId('account-tx-save').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('1250.00');

    await page.getByTestId('account-tx-direction').selectOption('outflow');
    await page.getByTestId('account-tx-amount').fill('50.00');
    await page.getByTestId('account-tx-purpose').fill('Petty cash');
    await page.getByTestId('account-tx-save').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('1200.00');

    await page.getByTestId('account-transfer-destination').selectOption({ label: 'P4 Bank' });
    await page.getByTestId('account-transfer-amount').fill('100.00');
    await page.getByTestId('account-transfer-save').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('1100.00');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P4 Bank' })
      .getByTestId('account-open')
      .click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('100.00');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P4 Cash' })
      .getByTestId('account-open')
      .click();
    await page.getByTestId('account-transfer-reverse').click();
    await page.getByTestId('account-reverse-reason').fill('Undo float transfer');
    await page.getByTestId('account-reverse-save').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('1200.00');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P4 Bank' })
      .getByTestId('account-open')
      .click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('0.00');
  });
});
