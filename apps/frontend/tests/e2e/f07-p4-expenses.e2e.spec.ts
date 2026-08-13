import { expect, test } from '@playwright/test';
import {
  bootstrapApprovedOwner,
  createAccountWithOpening,
  createBranchAndWarehouse,
} from './f07-p4-support';

test.describe('F07 P4 expenses vertical slice', () => {
  test('create/post expense, account decrease, and correction restores the account', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();

    await bootstrapApprovedOwner(page, request, {
      organizationName: `F07 P4 Expenses Org ${stamp}`,
      ownerEmail: `f07p4-expenses-${stamp}@example.com`,
      displayName: 'F07 P4 Expenses Owner',
    });
    await createBranchAndWarehouse(page, {
      branch: 'P4 Branch',
      prefix: 'P4X',
      warehouse: 'P4 WH',
    });
    await createAccountWithOpening(page, { name: 'P4 Cash', type: 'cash', opening: '1000.00' });

    await page.getByTestId('nav-expenses').click();
    await page.getByTestId('expense-categories-link').click();
    await page.getByTestId('expense-category-create-link').click();
    await page.getByTestId('expense-category-name').fill('Fuel');
    await page.getByTestId('expense-category-save').click();
    await expect(page.getByTestId('expense-categories-list')).toContainText('Fuel');

    await page.getByTestId('nav-expenses').click();
    await page.getByTestId('expense-create-link').click();
    await page.getByTestId('expense-category').selectOption({ label: 'Fuel' });
    await page.getByTestId('expense-account').selectOption({ label: 'P4 Cash' });
    await page.getByTestId('expense-amount').fill('80.00');
    await page.getByTestId('expense-purpose').fill('Generator fuel');
    await page.getByTestId('expense-date').fill('2026-08-13');
    await page.getByTestId('expense-save').click();
    await expect(page).toHaveURL(/\/app\/expenses\/[^/]+$/);
    await page.getByTestId('expense-post').click();
    await expect(page.getByTestId('expense-posted')).toBeVisible();
    await expect(page.getByTestId('expense-success')).toContainText('account outflow');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P4 Cash' })
      .getByTestId('account-open')
      .click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('920.00');

    await page.getByTestId('nav-expenses').click();
    await page.getByTestId('expense-open').first().click();
    await page.getByTestId('expense-correct-reason').fill('Posted in error');
    await page.getByTestId('expense-correct-save').click();
    await expect(page.getByTestId('expense-corrected')).toBeVisible();

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page
      .getByTestId('accounts-list')
      .locator('article')
      .filter({ hasText: 'P4 Cash' })
      .getByTestId('account-open')
      .click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('1000.00');
  });
});
