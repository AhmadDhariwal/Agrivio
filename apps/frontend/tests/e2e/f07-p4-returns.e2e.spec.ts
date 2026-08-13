import { expect, test } from '@playwright/test';
import {
  bootstrapApprovedOwner,
  createAccountWithOpening,
  createBranchAndWarehouse,
  createSellableProductWithOpening,
} from './f07-p4-support';

test.describe('F07 P4 returns vertical slice', () => {
  test('linked sales return, refund, reverse, and without-invoice approval', async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000);
    const stamp = Date.now();
    const organizationName = `F07 P4 Returns Org ${stamp}`;
    const ownerEmail = `f07p4-returns-${stamp}@example.com`;

    await bootstrapApprovedOwner(page, request, {
      organizationName,
      ownerEmail,
      displayName: 'F07 P4 Returns Owner',
    });
    await createBranchAndWarehouse(page, {
      branch: 'F07 Branch',
      prefix: 'F7R',
      warehouse: 'F07 WH',
    });
    await createAccountWithOpening(page, { name: 'F07 Cash', type: 'cash', opening: '10000.00' });
    await createSellableProductWithOpening(page, {
      category: 'F07 Cat',
      product: 'F07 Product',
      warehouse: 'F07 WH',
      quantity: '50',
      inventoryValue: '2500.00',
      retailPrice: '100.00',
    });

    await page.getByTestId('nav-sales').click();
    await page.getByTestId('sale-create-link').click();
    await expect(page.getByTestId('sale-draft-banner')).toBeVisible();
    await page.getByTestId('sale-branch').selectOption({ label: 'F07 Branch' });
    await page.getByTestId('sale-warehouse').selectOption({ label: 'F07 WH' });
    await page.getByTestId('sale-date').fill('2026-08-13');
    await page.getByTestId('sale-line-product').selectOption({ label: 'F07 Product' });
    await page.getByTestId('sale-line-quantity').fill('2');
    await expect(page.getByTestId('sale-line-unit-price')).toHaveValue('100.00', { timeout: 10_000 });
    await page.getByTestId('sale-save').click();
    await expect(page).toHaveURL(/\/app\/sales\/[^/]+$/);
    await expect(page.getByTestId('sale-post')).toBeVisible();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await page.getByTestId('sale-payment-account').count()) >= 1) {
        break;
      }
      await page.getByTestId('sale-add-payment').click();
      await page.waitForTimeout(200);
    }
    await page.getByTestId('sale-payment-account').selectOption({ label: 'F07 Cash (cash)' });
    await page.getByTestId('sale-payment-amount').fill('200.00');
    await page.getByTestId('sale-post').click();
    await expect(page.getByTestId('sale-posted-banner')).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId('sales-return-section')).toBeVisible();
    await page.getByTestId('sales-return-reason').fill('E2E linked sales return');
    await page.getByTestId('sales-return-resolution').selectOption('account_refund');
    await page.getByTestId('sales-return-refund-account').selectOption({ label: 'F07 Cash (cash)' });
    await page.getByTestId('add-sales-return-line').click();
    await page.getByTestId('sales-return-qty').fill('1');
    await page.getByTestId('sales-return-condition').selectOption('sellable');
    await page.getByTestId('sales-return-submit').click();
    await expect(page.getByTestId('sale-success')).toContainText('Sales return posted');
    await expect(page.getByTestId('posted-return-link')).toBeVisible();

    await page.getByTestId('nav-inventory').click();
    await expect(page.getByTestId('stock-list')).toContainText('49.0000');

    await page.getByRole('link', { name: 'Accounts' }).click();
    await page.getByTestId('accounts-list').locator('article').filter({ hasText: 'F07 Cash' }).getByTestId('account-open').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('10100.00');

    await page.getByTestId('nav-returns').click();
    await expect(page.getByTestId('returns-list')).toBeVisible();
    await page.getByTestId('return-open').first().click();
    await expect(page.getByTestId('return-detail')).toBeVisible();
    await expect(page.getByTestId('return-status')).toContainText('posted');
    await page.getByTestId('return-reverse-reason').fill('E2E reverse linked return');
    await page.getByTestId('return-reverse').click();
    await expect(page.getByTestId('return-reversed')).toBeVisible();

    await page.getByTestId('nav-inventory').click();
    await expect(page.getByTestId('stock-list')).toContainText('48.0000');
    await page.getByRole('link', { name: 'Accounts' }).click();
    await page.getByTestId('accounts-list').locator('article').filter({ hasText: 'F07 Cash' }).getByTestId('account-open').click();
    await expect(page.getByTestId('account-derived-balance')).toContainText('10200.00');

    await page.getByTestId('nav-returns').click();
    await page.getByTestId('without-invoice-link').click();
    await expect(page.getByTestId('without-invoice-form')).toBeVisible();
    await page.getByTestId('without-invoice-warehouse').selectOption({ label: 'F07 WH' });
    await page.getByTestId('without-invoice-name').fill('Walk-in Rasheed');
    await page.getByTestId('without-invoice-phone').fill('03001112233');
    await page.getByTestId('without-invoice-product').selectOption({ label: 'F07 Product' });
    await page.getByTestId('without-invoice-qty').fill('1');
    await page.getByTestId('without-invoice-condition').selectOption('sellable');
    await page.getByTestId('without-invoice-reason').fill('E2E return without invoice');
    await page.getByTestId('without-invoice-value').fill('50.00');
    await page.getByTestId('without-invoice-resolution').selectOption('account_refund');
    await page.getByTestId('without-invoice-refund-account').selectOption({ label: 'F07 Cash (cash)' });
    await page.getByTestId('without-invoice-submit').click();
    await expect(page).toHaveURL(/\/app\/returns$/);
    await expect(page.getByTestId('returns-list')).toContainText('Return without invoice');
  });
});
