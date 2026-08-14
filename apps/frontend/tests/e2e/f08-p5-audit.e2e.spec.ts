import { expect, test } from '@playwright/test';
import { bootstrapF08Owner } from './f08-p5-support';

test.describe('F08 P5 audit', () => {
  test('sidebar audit inquiry shows the owner organization customer.created event', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    await bootstrapF08Owner(page, request, stamp);
    const customerName = `Audited Farmer ${stamp}`;

    await page.getByRole('link', { name: 'Customers' }).click();
    await page.getByTestId('customer-create-link').click();
    await page.getByTestId('customer-name').fill(customerName);
    await page.getByTestId('customer-type').selectOption('farmer');
    await page.getByTestId('customer-save').click();
    await expect(page.getByTestId('customers-list')).toContainText(customerName);

    await page.getByTestId('nav-audit').click();
    await expect(page).toHaveURL(/\/app\/audit$/);
    await expect(page.getByTestId('audit-page')).toBeVisible();
    await expect(page.getByTestId('audit-table')).toContainText('customer.created');
    await page.getByTestId('audit-action').fill('customer.created');
    await page.getByTestId('audit-search').click();
    await expect(page.getByTestId('audit-table')).toContainText('customer.created');
  });
});
