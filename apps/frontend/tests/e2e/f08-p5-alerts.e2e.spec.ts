import { expect, test } from '@playwright/test';
import { bootstrapF08Owner, createCustomerWithReceivable } from './f08-p5-support';

test.describe('F08 P5 alerts', () => {
  test('notification center shows customer dues from ledger openings and acknowledges', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    await bootstrapF08Owner(page, request, stamp);
    await createCustomerWithReceivable(page, `Dues Farmer ${stamp}`, '1500.00');

    await page.getByTestId('nav-alerts').click();
    await expect(page).toHaveURL(/\/app\/alerts$/);
    await expect(page.getByTestId('alerts-page')).toBeVisible();
    await expect(page.getByTestId('alert-summary-customer-dues')).toHaveText('1');
    await expect(page.getByTestId('notification-customer_dues')).toContainText('1500.00');
    await page.getByTestId('acknowledge-notification').click();
    await expect(page.getByTestId('notification-customer_dues')).toContainText('Acknowledged');
  });
});
