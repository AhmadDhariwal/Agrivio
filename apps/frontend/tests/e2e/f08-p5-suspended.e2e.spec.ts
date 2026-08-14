import { expect, test } from '@playwright/test';
import { API, bootstrapF08Owner } from './f08-p5-support';

test.describe('F08 P5 suspended UX', () => {
  test('suspended owner can use reports and audit but not dashboard or imports', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    await bootstrapF08Owner(page, request, stamp);

    const sessionRes = await page.request.get(`${API}/api/v1/auth/session`);
    const sessionBody = await sessionRes.json();
    const organizationId = sessionBody.data.activeContext.organizationId as string;

    const csrf = await request.post(`${API}/api/v1/auth/csrf`);
    const csrfToken = ((await csrf.json()) as { data: { csrfToken: string } }).data.csrfToken;
    const listed = await request.get(`${API}/api/v1/platform/subscriptions`, {
      headers: { 'X-Platform-Actor': 'super-admin' },
    });
    expect(listed.status()).toBe(200);
    const subscription = (
      (await listed.json()) as {
        data: { items: Array<{ id: string; organizationId: string; version: number }> };
      }
    ).data.items.find((item) => item.organizationId === organizationId);
    expect(subscription).toBeTruthy();

    const suspended = await request.post(
      `${API}/api/v1/platform/subscriptions/${subscription?.id}/suspend`,
      {
        headers: {
          'X-CSRF-Token': csrfToken,
          'X-Platform-Actor': 'super-admin',
        },
        data: { expectedVersion: subscription?.version, reason: 'F08 P5 suspended UX' },
      },
    );
    expect(suspended.status()).toBe(200);

    await page.reload();
    await expect(page.getByTestId('authenticated-shell')).toBeVisible();

    await page.getByTestId('nav-dashboard').click();
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByText(/operational dashboard is blocked/i)).toBeVisible();

    await page.getByTestId('nav-reports').click();
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await expect(page.getByText(/Historical report viewing and entitled exports remain available/)).toBeVisible();
    await page.getByTestId('report-select').selectOption('sales');
    await page.getByTestId('report-run').click();
    await expect(page.getByTestId('report-run')).toBeEnabled();

    await page.getByTestId('nav-imports').click();
    await expect(page.getByTestId('imports-page')).toBeVisible();
    await expect(page.getByText(/Import preview and execution are blocked/)).toBeVisible();
    await expect(page.getByTestId('import-preview-submit')).toHaveCount(0);

    await page.getByTestId('nav-audit').click();
    await expect(page.getByTestId('audit-page')).toBeVisible();
    await expect(page.getByText(/Historical audit inquiry remains available/)).toBeVisible();
  });
});
