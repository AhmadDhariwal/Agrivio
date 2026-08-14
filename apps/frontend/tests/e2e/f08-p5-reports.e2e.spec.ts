import { expect, test } from '@playwright/test';
import { API, bootstrapF08Owner, createCustomerWithReceivable } from './f08-p5-support';

test.describe('F08 P5 reports and export', () => {
  test('customer ledger report totals match dashboard receivables and export contract', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    await bootstrapF08Owner(page, request, stamp);
    const customerId = await createCustomerWithReceivable(page, `Ledger Farmer ${stamp}`, '1500.00');

    await page.getByTestId('nav-dashboard').click();
    await expect(page.getByTestId('dash-receivables')).toContainText('1500.00');

    await page.getByTestId('nav-reports').click();
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await page.getByTestId('report-select').selectOption('customer-ledger');
    await page.getByTestId('filter-customerId').fill(customerId);
    await page.getByTestId('report-run').click();
    await expect(page.getByTestId('report-totals')).toContainText('1500.00');

    const csrfRes = await page.request.post(`${API}/api/v1/auth/csrf`);
    const csrfBody = await csrfRes.json();
    const exported = await page.request.post(`${API}/api/v1/reports/customer-ledger/export`, {
      headers: { 'X-CSRF-Token': csrfBody.data.csrfToken as string },
      data: { format: 'csv', filters: { customerId } },
    });
    expect(exported.status()).toBe(200);
    expect(exported.headers()['content-type'] ?? '').toContain('csv');
    expect(await exported.text()).toContain('1500.00');

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-csv').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('customer-ledger');
  });
});
